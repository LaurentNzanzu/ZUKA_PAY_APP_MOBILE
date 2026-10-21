import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useZuki } from "@/lib/zuki/store";
import type { Group } from "@/lib/zuki/types";

/** Lists the user's groups; once one is picked, renders only `children(group)`. */
export function GroupPicker({ title, children }: { title: string; children: (g: Group) => ReactNode }) {
  const { t } = useI18n();
  const { groups } = useZuki();
  const [id, setId] = useState<string | null>(null);
  const group = groups.find((g) => g.id === id);

  if (group) {
    return (
      <div>
        <div className="px-4">
          <button
            onClick={() => setId(null)}
            className="pressable flex items-center gap-1 text-[13px] font-semibold text-lagoon"
          >
            <ChevronLeft className="size-4" /> {t("pick.back")}
          </button>
          <h1 className="mt-2 font-display text-2xl font-bold">{title}</h1>
          <p className="text-[13px] font-semibold text-deep">{group.name}</p>
        </div>
        {children(group)}
      </div>
    );
  }

  return (
    <section className="px-4">
      <h1 className="font-display text-2xl font-bold">{title}</h1>
      <p className="mt-1 text-[13px] text-muted-foreground">{t("pick.choose")}</p>
      {groups.length === 0 && <p className="mt-4 text-sm text-muted-foreground">{t("turns.empty")}</p>}
      <div className="mt-4 divide-y divide-line overflow-hidden rounded-3xl bg-card shadow-card">
        {groups.map((g) => (
          <button
            key={g.id}
            onClick={() => setId(g.id)}
            className="pressable flex w-full items-center gap-3 p-3 text-left"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-lagoon/12 font-display text-sm font-bold text-deep">
              {g.name.slice(0, 2).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{g.name}</span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </button>
        ))}
      </div>
    </section>
  );
}
