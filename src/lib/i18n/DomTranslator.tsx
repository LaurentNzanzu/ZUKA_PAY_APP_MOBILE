import { useEffect } from "react";
import { translateTexts } from "./translate.functions";

const ATTRS = ["placeholder", "aria-label", "title", "alt"] as const;
const SKIP = "script,style,noscript,code,pre,textarea,[contenteditable],[data-no-translate],.font-mono";
const HAS_LETTER = /\p{L}{2,}/u;

/**
 * Live translation layer for languages without a hand-written dictionary.
 * The app renders its English texts; this layer swaps every visible text
 * (static, dynamic, toasts, dialogs, server messages) for its translation,
 * using a local cache first, then the shared server cache / AI translation.
 */
export function DomTranslator({ lang }: { lang: string }) {
  useEffect(() => {
    const storeKey = `zuka.tr.${lang}`;
    let cache: Record<string, string> = {};
    try {
      cache = JSON.parse(localStorage.getItem(storeKey) ?? "{}");
    } catch {
      cache = {};
    }
    // node → { source text, text we wrote }
    const texts = new Map<Text, { src: string; out: string }>();
    const attrs = new Map<Element, Record<string, { src: string; out: string }>>();
    const pending = new Set<string>();
    const failed = new Set<string>();
    let timer: number | undefined;
    let inflight = 0;
    let stopped = false;

    const skip = (el: Element | null) => !el || !!el.closest(SKIP);

    const applyText = (node: Text) => {
      const cur = node.data;
      const rec = texts.get(node);
      if (rec && rec.out !== rec.src && cur === rec.out) return;
      if (rec && cur === rec.out) {
        const k = cur.trim();
        if (!cache[k] || cache[k] === k) return;
      }
      const src = cur;
      const core = src.trim();
      if (!core || !HAS_LETTER.test(core) || core.length > 600) return;
      const tr = cache[core];
      if (tr) {
        const out = src.replace(core, tr);
        texts.set(node, { src, out });
        if (node.data !== out) node.data = out;
      } else {
        texts.set(node, { src, out: src });
        if (!failed.has(core)) pending.add(core);
      }
    };

    const applyAttrs = (el: Element) => {
      for (const a of ATTRS) {
        const v = el.getAttribute(a);
        if (!v) continue;
        const map = attrs.get(el) ?? {};
        const rec = map[a];
        if (rec && v === rec.out && (rec.out !== rec.src || !cache[v.trim()] || cache[v.trim()] === v.trim())) continue;
        const core = v.trim();
        if (!HAS_LETTER.test(core) || core.length > 600) continue;
        const tr = cache[core];
        map[a] = { src: v, out: tr ?? v };
        attrs.set(el, map);
        if (tr) {
          if (v !== tr) el.setAttribute(a, tr);
        }
        else if (!failed.has(core)) pending.add(core);
      }
    };

    const scan = (root: Node) => {
      if (root.nodeType === Node.TEXT_NODE) {
        if (!skip(root.parentElement)) applyText(root as Text);
        return;
      }
      if (!(root instanceof Element) || skip(root)) return;
      applyAttrs(root);
      root.querySelectorAll("*").forEach((el) => {
        if (!skip(el)) applyAttrs(el);
      });
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let n: Node | null;
      while ((n = walker.nextNode())) if (!skip(n.parentElement)) applyText(n as Text);
    };

    const flush = async () => {
      if (stopped || !pending.size || inflight > 2) return;
      const batch = [...pending].slice(0, 60);
      batch.forEach((b) => pending.delete(b));
      inflight++;
      try {
        const res = await translateTexts({ data: { lang, texts: batch } });
        for (const b of batch) {
          if (res[b]) cache[b] = res[b];
          else failed.add(b);
        }
        try {
          localStorage.setItem(storeKey, JSON.stringify(cache));
        } catch {
          /* storage full */
        }
      } catch {
        batch.forEach((b) => failed.add(b));
      } finally {
        inflight--;
      }
      if (!stopped) {
        scan(document.body);
        if (pending.size) schedule();
      }
    };
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void flush(), 120);
    };

    const observer = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === "characterData") scan(m.target);
        else if (m.type === "attributes") {
          if (m.target instanceof Element && !skip(m.target)) applyAttrs(m.target);
        } else m.addedNodes.forEach(scan);
      }
      if (pending.size) schedule();
    });

    scan(document.body);
    if (pending.size) schedule();
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...ATTRS],
    });

    return () => {
      stopped = true;
      observer.disconnect();
      window.clearTimeout(timer);
      // Restore the original texts when leaving this language.
      texts.forEach((r, node) => {
        if (node.isConnected && node.data === r.out) node.data = r.src;
      });
      attrs.forEach((map, el) => {
        for (const [a, r] of Object.entries(map)) if (el.getAttribute(a) === r.out) el.setAttribute(a, r.src);
      });
    };
  }, [lang]);

  return null;
}
