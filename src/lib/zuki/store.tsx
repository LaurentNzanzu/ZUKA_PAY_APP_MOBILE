import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  getTransactionStatus,
  initiateContributionPayment,
} from "@/lib/payments/payments.functions";
import {
  castVote as castVoteFn,
  createTontine,
  createVote as createVoteFn,
  importLegacyGroups,
  listMyGroups,
  requestSwap as requestSwapFn,
  resolveSwap as resolveSwapFn,
  setAcceptance as setAcceptanceFn,
  setReminders as setRemindersFn,
  setLatePenalty as setLatePenaltyFn,
  updateMyProfile,
} from "@/lib/tontines/tontines.functions";
import type {
  Acceptance,
  Currency,
  Group,
  Member,
  Reminders,
  Threshold,
  TxStatus,
} from "./types";

import { currentLang, pick } from "@/lib/i18n";
import { translateError } from "@/lib/i18n/errors";

function errorText(e: unknown): string {
  return translateError(e, ["Paiement impossible.", "Payment failed.", "Malipo hayawezekani."]);
}

const LEGACY_KEY = "zuki.state.v2";
const CACHE_KEY = "zuka.groups.cache.v1";
const IMPORT_FLAG = "zuka.legacy.imported.v1";
const CURRENCY_KEY = "zuka.currency";

const ME = "me";

let seq = 0;
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

interface StoreValue {
  groups: Group[];
  currentUserId: string;
  me: Member;
  loading: boolean;
  preferredCurrency: Currency;
  setPreferredCurrency: (c: Currency) => void;
  updateMe: (patch: Partial<Member>) => void;
  addGroup: (g: Group) => Promise<string>;
  pay: (args: {
    groupId: string;
    dueId: string;
    amount: number;
    msisdn: string;
  }) => Promise<{
    ok: boolean;
    ref: string;
    status?: TxStatus | undefined;
    message?: string | undefined;
  }>;
  requestSwap: (groupId: string, targetMemberId: string, direction: "earlier" | "later") => void;
  resolveSwap: (groupId: string, swapId: string, accept: boolean) => void;
  setAcceptance: (groupId: string, answer: Acceptance) => void;
  createVote: (
    groupId: string,
    v: { title: string; description: string; deadline: string; threshold: Threshold },
  ) => void;
  castVote: (groupId: string, voteId: string, answer: "yes" | "no") => void;
  setReminders: (groupId: string, patch: Partial<Reminders>) => void;
  newId: (prefix: string) => string;
  setLatePenalty: (groupId: string, enabled: boolean, amount: number) => Promise<void>;
}

const StoreContext = createContext<StoreValue | null>(null);

export function ZukiProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [preferredCurrency, setCurrency] = useState<Currency>("CDF");
  const [pendingRefs, setPendingRefs] = useState<Record<string, string>>({});
  const [localProfile, setLocalProfile] = useState<{ name: string; phone: string }>({
    name: "",
    phone: "",
  });

  const load = useServerFn(listMyGroups);
  const importLegacy = useServerFn(importLegacyGroups);
  const create = useServerFn(createTontine);
  const saveProfile = useServerFn(updateMyProfile);
  const swapRequest = useServerFn(requestSwapFn);
  const swapResolve = useServerFn(resolveSwapFn);
  const acceptance = useServerFn(setAcceptanceFn);
  const voteCreate = useServerFn(createVoteFn);
  const voteCast = useServerFn(castVoteFn);
  const remindersSave = useServerFn(setRemindersFn);
  const penaltySave = useServerFn(setLatePenaltyFn);
  const initiate = useServerFn(initiateContributionPayment);
  const checkStatus = useServerFn(getTransactionStatus);

  useEffect(() => {
    const stored = localStorage.getItem(CURRENCY_KEY);
    if (stored === "USD" || stored === "CDF") setCurrency(stored);
    void supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED")
        setSignedIn(Boolean(session));
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const query = useQuery({
    queryKey: ["zuka-groups"],
    queryFn: () => load(),
    enabled: signedIn === true,
    retry: false,
    staleTime: 15_000,
  });

  /** One-time upload of data created before the backend existed. */
  useEffect(() => {
    if (signedIn !== true || !query.isSuccess) return;
    if (localStorage.getItem(IMPORT_FLAG)) return;
    const raw = localStorage.getItem(LEGACY_KEY);
    localStorage.setItem(IMPORT_FLAG, "1");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { groups?: Group[]; currentUserId?: string };
      if (!parsed.groups?.length) return;
      void importLegacy({
        data: { groups: parsed.groups, currentUserId: parsed.currentUserId ?? "u1" },
      }).then(() => queryClient.invalidateQueries({ queryKey: ["zuka-groups"] }));
    } catch {
      /* corrupted local data is simply ignored */
    }
  }, [signedIn, query.isSuccess, importLegacy, queryClient]);

  // Offline cache: the last server snapshot stays readable without network.
  useEffect(() => {
    if (query.data?.groups) localStorage.setItem(CACHE_KEY, JSON.stringify(query.data.groups));
  }, [query.data]);

  const cached = useMemo<Group[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "[]") as Group[];
    } catch {
      return [];
    }
  }, []);

  const groups = query.data?.groups ?? (query.isLoading ? cached : []);
  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["zuka-groups"] }),
    [queryClient],
  );

  const setPreferredCurrency = useCallback((c: Currency) => {
    setCurrency(c);
    localStorage.setItem(CURRENCY_KEY, c);
  }, []);

  const pay: StoreValue["pay"] = useCallback(
    async ({ groupId, dueId, amount, msisdn }) => {
      const group = groups.find((g) => g.id === groupId);
      const currency: Currency = group?.currency ?? "CDF";

      // Idempotency: one key per (group, due, member, amount) attempt in flight.
      const key = `${groupId}:${dueId}:${amount}`;
      const idempotencyKey = pendingRefs[key] ?? `${key}:${Date.now().toString(36)}`;
      setPendingRefs((p) => ({ ...p, [key]: idempotencyKey }));

      let reference: string;
      try {
        const created = await initiate({
          data: { groupRef: groupId, dueRef: dueId, amount, currency, msisdn, idempotencyKey },
        });
        reference = created.reference;
      } catch (e) {
        return { ok: false, ref: "", status: "FAILED" as const, message: errorText(e) };
      }

      // The provider is the only source of truth: poll the backend until the
      // aggregator (webhook or status read) settles the transaction.
      const deadline = Date.now() + 120_000;
      let status: TxStatus = "PENDING";
      let message: string | undefined;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 3000));
        try {
          const live = await checkStatus({ data: { reference } });
          status = live.status as TxStatus;
          message = live.failureReason ?? undefined;
        } catch {
          continue; // transient network issue — keep waiting
        }
        if (status !== "PENDING" && status !== "PROCESSING") break;
      }

      await refresh();
      if (status !== "PENDING" && status !== "PROCESSING")
        setPendingRefs((p) => {
          const next = { ...p };
          delete next[key];
          return next;
        });

      if (status === "SUCCESS") return { ok: true, ref: reference, status };
      return { ok: false, ref: reference, status, message };
    },
    [checkStatus, groups, initiate, pendingRefs, refresh],
  );

  const me = useMemo<Member>(() => {
    const found = groups.flatMap((g) => g.members).find((m) => m.id === ME);
    return (
      found ?? {
        id: ME,
        name: localProfile.name || query.data?.profile.name || pick(currentLang(), { fr: "Mon compte", en: "My account", sw: "Akaunti yangu" }),
        phone: localProfile.phone || query.data?.profile.phone || "",
        role: "member",
      }
    );
  }, [groups, localProfile, query.data]);

  const value: StoreValue = {
    groups,
    currentUserId: ME,
    me,
    loading: signedIn === null || query.isLoading,
    preferredCurrency,
    setPreferredCurrency,
    updateMe: (patch) => {
      setLocalProfile((p) => ({
        name: patch.name ?? p.name,
        phone: patch.phone ?? p.phone,
      }));
      void saveProfile({
        data: {
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
        },
      }).then(refresh);
    },
    addGroup: async (g) => {
      const res = await create({
        data: {
          name: g.name,
          description: g.description,
          currency: g.currency,
          amount: g.amount,
          frequency: g.frequency,
          dayMode: g.dayMode,
          weekdays: g.weekdays,
          startDate: g.startDate,
          totalDues: g.totalDues || g.dues.length || 12,
          maxMembers: g.maxMembers,
          members: g.members.map((m) => ({ name: m.name, phone: m.phone })),
          rules: g.rules,
          reminders: g.reminders,
          ...(g.latePenalty ? { latePenalty: g.latePenalty } : {}),
          ...(g.subscriptionMode ? { subscriptionMode: g.subscriptionMode } : {}),
        },
      });
      await refresh();
      return res.id;
    },
    pay,
    requestSwap: (groupId, targetMemberId, direction) => {
      void swapRequest({ data: { groupId, targetMemberId, direction } }).then(refresh);
    },
    resolveSwap: (groupId, swapId, accept) => {
      void swapResolve({ data: { groupId, swapId, accept } }).then(refresh);
    },
    setAcceptance: (groupId, answer) => {
      void acceptance({ data: { groupId, answer } }).then(refresh);
    },
    createVote: (groupId, v) => {
      void voteCreate({ data: { groupId, ...v } }).then(refresh);
    },
    castVote: (groupId, voteId, answer) => {
      void voteCast({ data: { groupId, voteId, answer } }).then(refresh);
    },
    setReminders: (groupId, patch) => {
      const current = groups.find((g) => g.id === groupId)?.reminders;
      if (!current) return;
      void remindersSave({ data: { groupId, reminders: { ...current, ...patch } } }).then(refresh);
    },
    newId: uid,
    setLatePenalty: async (groupId, enabled, amount) => {
      await penaltySave({ data: { groupId, enabled, amount } });
      await refresh();
    },
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useZuki() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useZuki must be used inside ZukiProvider");
  return ctx;
}
