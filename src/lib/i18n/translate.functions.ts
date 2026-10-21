import { createServerFn } from "@tanstack/react-start";
import { BUILTIN, findLanguage } from "./languages";

/**
 * Translates interface texts (English source) into any supported language.
 * Results are cached in ui_translations so each text is translated once per language.
 * Public on purpose (sign-in page needs it); input is strictly bounded.
 */
export const translateTexts = createServerFn({ method: "POST" })
  .inputValidator((input: { lang: string; texts: string[] }) => {
    const info = findLanguage(input.lang);
    if (!info || BUILTIN.has(info.code)) throw new Error("Unsupported language");
    if (!Array.isArray(input.texts)) throw new Error("Invalid texts");
    const texts = [...new Set(input.texts.filter((t) => typeof t === "string" && t.trim() && t.length <= 600))].slice(0, 80);
    return { lang: info.code, texts };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabaseAdmin = admin as any;
    const out: Record<string, string> = {};
    if (!data.texts.length) return out;

    const { data: cached } = await supabaseAdmin
      .from("ui_translations")
      .select("source, translated")
      .eq("lang", data.lang)
      .in("source", data.texts);
    for (const r of (cached ?? []) as { source: string; translated: string }[]) out[r.source] = r.translated;

    const missing = data.texts.filter((t) => !(t in out));
    if (!missing.length) return out;

    const info = findLanguage(data.lang)!;
    const key = process.env['LOVABLE_API_KEY'];
    if (!key) return out;

    const prompt =
      `Translate each string of this JSON array from English (or French) into ${info.name} (${info.native}, code ${info.code}) ` +
      `for the user interface of "ZUKA PAY", a mobile app for tontines (rotating savings groups) and Mobile Money contributions. ` +
      `Keep it short and natural for buttons and labels. Keep "ZUKA PAY", numbers, amounts, currency codes (CDF, USD), references, emojis, ` +
      `placeholders and punctuation unchanged. Keep uppercase if the source is uppercase. ` +
      `Reply with ONLY a JSON array of the same length and order, nothing else.\n\n${JSON.stringify(missing)}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        "Lovable-API-Key": key,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        input: prompt,
        reasoning: { effort: "low" },
        store: false,
        stream: true,
      }),
    });
    if (!res.ok || !res.body) {
      console.error("translate failed", res.status, await res.text().catch(() => ""));
      return out;
    }

    // Consume the SSE stream and keep the output text.
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let text = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const ev = JSON.parse(payload);
          if (ev.type === "response.output_text.delta" && typeof ev.delta === "string") text += ev.delta;
        } catch {
          /* ignore */
        }
      }
    }

    let arr: unknown;
    try {
      arr = JSON.parse(text.slice(text.indexOf("["), text.lastIndexOf("]") + 1));
    } catch {
      return out;
    }
    if (!Array.isArray(arr) || arr.length !== missing.length) return out;

    const rows = missing
      .map((source, i) => ({ lang: data.lang, source, translated: String(arr[i] ?? "").slice(0, 1200) }))
      .filter((r) => r.translated.trim());
    for (const r of rows) out[r.source] = r.translated;
    if (rows.length) await supabaseAdmin.from("ui_translations").upsert(rows, { onConflict: "lang,source" });
    return out;
  });
