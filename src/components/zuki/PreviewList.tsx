import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useI18n } from "@/lib/i18n";

/** Visual preview only: shows the first `limit` items, "Voir tout" opens the full list. Data is never truncated. */
export function PreviewList<T>({
  items,
  render,
  title,
  className,
  limit = 4,
}: {
  items: T[];
  render: (item: T, index: number) => ReactNode;
  title: string;
  className?: string;
  limit?: number;
}) {
  const [open, setOpen] = useState(false);
  const { lang } = useI18n() as { lang?: string };
  const label = lang === "en" ? "See all" : lang === "sw" ? "Tazama zote" : "Voir tout";
  const extra = items.length > limit;
  return (
    <>
      <div className={className}>{items.slice(0, limit).map((it, i) => render(it, i))}</div>
      {extra && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-2 flex h-10 w-full items-center justify-center gap-1 rounded-xl bg-lagoon/10 text-xs font-semibold text-lagoon transition-colors active:bg-lagoon/20"
        >
          {label} ({items.length}) <ChevronRight className="size-4" />
        </button>
      )}
      {extra && (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="mx-auto max-h-[90vh] max-w-lg overflow-y-auto rounded-t-3xl bg-background">
            <SheetHeader>
              <SheetTitle className="text-left font-display">
                {title} <span className="font-mono text-xs text-muted-foreground">· {items.length}</span>
              </SheetTitle>
            </SheetHeader>
            <div
              className={className + " mt-3"}
              onClickCapture={(e) => {
                // Close the full-list sheet when an item is opened so the destination is visible.
                if ((e.target as HTMLElement).closest("a,button")) setTimeout(() => setOpen(false), 0);
              }}
            >
              {items.map((it, i) => render(it, i))}
            </div>
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
