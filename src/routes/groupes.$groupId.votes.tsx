import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Plus, Vote as VoteIcon } from "lucide-react";
import { toast } from "sonner";
import { Shell, SectionTitle } from "@/components/zuki/Shell";
import { useI18n } from "@/lib/i18n";
import { useZuki } from "@/lib/zuki/store";
import { addDays, todayISO, voteTally } from "@/lib/zuki/engine";
import type { Threshold } from "@/lib/zuki/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/groupes/$groupId/votes")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Votes du groupe — ZUKA PAY" },
      {
        name: "description",
        content: "Décisions collectives : nouveau membre, changement de règle, échange de tour ou nouvelle date.",
      },
      { property: "og:title", content: "Votes du groupe — ZUKA PAY" },
      { property: "og:description", content: "Majorité simple, deux tiers ou unanimité, résultat visible par tous." },
    ],
  }),
  component: VotesPage,
});

const inputCls =
  "h-12 w-full rounded-xl bg-background px-3 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-lagoon";

function VotesPage() {
  const { groupId } = useParams({ from: "/groupes/$groupId/votes" });
  const { t, formatDate } = useI18n();
  const { groups, me, createVote, castVote } = useZuki();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState(addDays(todayISO(), 3));
  const [threshold, setThreshold] = useState<Threshold>("simple");

  const group = groups.find((g) => g.id === groupId);
  if (!group) {
    return (
      <Shell>
        <p className="px-4 text-sm text-muted-foreground">{t("common.groupNotFound")}</p>
      </Shell>
    );
  }

  const thresholds: { key: Threshold; label: string }[] = [
    { key: "simple", label: t("vote.simple") },
    { key: "twothirds", label: t("vote.twothirds") },
    { key: "unanimity", label: t("vote.unanimity") },
  ];

  return (
    <Shell notifications={group.votes.filter((v) => v.status === "open").length}>
      <section className="px-4">
        <Link
          to="/groupes/$groupId"
          params={{ groupId: group.id }}
          className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-lagoon"
        >
          <ArrowLeft className="size-4" /> {t("common.back")}
        </Link>
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-lagoon/10">
            <VoteIcon className="size-5 text-lagoon" />
          </span>
          <h1 className="font-display text-2xl leading-tight">{t("vote.title")}</h1>
        </div>

        <button
          onClick={() => setOpen((v) => !v)}
          className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-lagoon/10 text-sm font-semibold text-lagoon"
        >
          <Plus className="size-4" /> {t("vote.new")}
        </button>

        {open && (
          <div className="mt-2 space-y-2 rounded-2xl bg-card p-3 ring-1 ring-line">
            <input
              className={inputCls}
              placeholder={t("vote.voteTitle")}
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 90))}
            />
            <textarea
              className={cn(inputCls, "h-20 py-2")}
              placeholder={t("vote.description")}
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 400))}
            />
            <label className="block text-[10px] text-muted-foreground">{t("vote.deadline")}</label>
            <input
              type="date"
              className={inputCls}
              value={deadline}
              min={todayISO()}
              onChange={(e) => setDeadline(e.target.value)}
            />
            <label className="block text-[10px] text-muted-foreground">{t("vote.threshold")}</label>
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-background p-1 ring-1 ring-line">
              {thresholds.map((th) => (
                <button
                  key={th.key}
                  onClick={() => setThreshold(th.key)}
                  className={cn(
                    "h-10 rounded-lg text-[11px] font-semibold",
                    threshold === th.key ? "bg-lagoon text-primary-foreground" : "text-muted-foreground",
                  )}
                >
                  {th.label}
                </button>
              ))}
            </div>
            <button
              disabled={title.trim().length < 3}
              onClick={() => {
                createVote(group.id, { title: title.trim(), description: description.trim(), deadline, threshold });
                setTitle("");
                setDescription("");
                setOpen(false);
                toast.success(t("vote.create"));
              }}
              className="h-12 w-full rounded-xl bg-coral text-sm font-bold text-coral-foreground disabled:opacity-40"
            >
              {t("vote.create")}
            </button>
          </div>
        )}

        <div className="mt-6">
          <SectionTitle title={t("vote.open")} hint={`${group.votes.length}`} />
          {group.votes.length === 0 && (
            <p className="rounded-2xl bg-card p-4 text-xs text-muted-foreground ring-1 ring-line">
              {t("vote.empty")}
            </p>
          )}
          <div className="space-y-2">
            {group.votes.map((v) => {
              const tally = voteTally(group, v);
              const myAnswer = v.responses.find((r) => r.memberId === me.id)?.answer;
              const pct = tally.total ? Math.round((tally.yes / tally.total) * 100) : 0;
              return (
                <div key={v.id} className="rounded-2xl bg-card p-4 ring-1 ring-line">
                  <div className="flex items-start justify-between gap-2">
                    <p className="flex-1 text-sm font-semibold leading-snug">{v.title}</p>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-1 text-[9px] font-bold",
                        v.status === "open" && "bg-wait/15 text-wait",
                        v.status === "approved" && "bg-ok/15 text-ok",
                        v.status === "rejected" && "bg-bad/15 text-bad",
                      )}
                    >
                      {v.status === "open"
                        ? t("vote.ongoing")
                        : v.status === "approved"
                          ? t("vote.approved")
                          : t("vote.rejected")}
                    </span>
                  </div>
                  {v.description && (
                    <p className="mt-1 text-[12.5px] leading-snug text-muted-foreground">{v.description}</p>
                  )}
                  <p className="mt-2 font-mono text-[10px] text-muted-foreground">
                    {t("vote.closes")} {formatDate(v.deadline)} · {tally.needed} {t("vote.needed")}
                  </p>

                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-background">
                    <div className="h-full rounded-full bg-ok transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                    {tally.yes} {t("vote.yes")} · {tally.no} {t("vote.no")} · {t("vote.voted")}{" "}
                    {v.responses.length}/{tally.total}
                  </p>

                  {v.status === "open" && (
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => castVote(group.id, v.id, "yes")}
                        className={cn(
                          "h-11 flex-1 rounded-xl text-xs font-bold",
                          myAnswer === "yes"
                            ? "bg-ok text-primary-foreground"
                            : "bg-ok/10 text-ok",
                        )}
                      >
                        ☑️ {t("vote.yes")}
                      </button>
                      <button
                        onClick={() => castVote(group.id, v.id, "no")}
                        className={cn(
                          "h-11 flex-1 rounded-xl text-xs font-bold",
                          myAnswer === "no" ? "bg-bad text-primary-foreground" : "bg-bad/10 text-bad",
                        )}
                      >
                        ❌ {t("vote.no")}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </Shell>
  );
}
