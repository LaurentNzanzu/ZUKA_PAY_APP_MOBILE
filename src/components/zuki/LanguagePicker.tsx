import { useMemo, useState } from "react";
import { Check, ChevronRight, Globe, Search } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useI18n } from "@/lib/i18n";
import { WORLD_LANGUAGES, countriesOf, countryName, findLanguage } from "@/lib/i18n/languages";
import { cn } from "@/lib/utils";

const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export function LanguagePicker() {
  const { uiLang, setLang, L } = useI18n();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const current = findLanguage(uiLang);

  const list = useMemo(() => {
    const n = norm(q.trim());
    if (!n) return WORLD_LANGUAGES;
    return WORLD_LANGUAGES.filter((l) =>
      [l.name, l.native, l.code, l.countries, countriesOf(l.code).map((c) => countryName(c, uiLang)).join(" ")].some((f) => norm(f).includes(n)),
    );
  }, [q, uiLang]);

  const title = L({ fr: "Langue de l'application", en: "App language", sw: "Lugha ya programu" });

  return (
    <>
      <p className="mt-4 text-xs font-medium text-muted-foreground">{title}</p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 flex min-h-14 w-full items-center gap-3 rounded-2xl bg-card p-3 text-start ring-1 ring-line"
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-lagoon/12 text-lagoon">
          <Globe className="size-5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1" data-no-translate>
          <span className="block truncate text-sm font-semibold">{current?.native ?? "Français"}</span>
          <span className="block truncate text-xs text-muted-foreground">{current?.name} · {current?.code}</span>
        </span>
        <ChevronRight className="size-4 text-muted-foreground rtl:rotate-180" aria-hidden="true" />
      </button>

      <Sheet open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(""); }}>
        <SheetContent side="bottom" className="flex h-[85dvh] flex-col gap-0 rounded-t-3xl p-0 safe-bottom">
          <SheetHeader className="p-4 pb-2 text-start">
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-2">
            <label className="flex h-12 items-center gap-2 rounded-xl bg-card px-3 ring-1 ring-line focus-within:ring-2 focus-within:ring-lagoon">
              <Search className="size-4 text-muted-foreground" aria-hidden="true" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={L({ fr: "Rechercher une langue ou un pays", en: "Search a language or country", sw: "Tafuta lugha au nchi" })}
                className="h-full w-full bg-transparent text-sm outline-none"
              />
            </label>
          </div>
          <ul className="flex-1 overflow-y-auto px-2 pb-4" data-no-translate>
            {list.map((l) => (
              <li key={l.code}>
                <button
                  type="button"
                  onClick={() => { setLang(l.code); setOpen(false); setQ(""); }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start transition-colors active:bg-muted",
                    l.code === uiLang && "bg-lagoon/10",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold" dir={l.rtl ? "rtl" : "ltr"}>{l.native}</span>
                    <span className="block truncate text-xs text-muted-foreground">{l.name} · {countriesOf(l.code).map((c) => countryName(c, uiLang)).join(", ")}</span>
                  </span>
                  <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{l.code}</span>
                  {l.code === uiLang && <Check className="size-4 text-lagoon" aria-hidden="true" />}
                </button>
              </li>
            ))}
            {list.length === 0 && (
              <li className="p-6 text-center text-sm text-muted-foreground">
                {L({ fr: "Aucune langue trouvée", en: "No language found", sw: "Hakuna lugha iliyopatikana" })}
              </li>
            )}
          </ul>
        </SheetContent>
      </Sheet>
    </>
  );
}
