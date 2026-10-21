<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- i18n: only fr/en/sw are offered (WORLD_LANGUAGES filtered by BUILTIN in src/lib/i18n/languages.ts), all with hand-written dictionaries in src/lib/i18n.tsx; any other stored/device language falls back to fr (or its country's fr/en/sw). Why: product decision — ZUKA PAY's only official languages are French, English, Swahili.
- Group subscription (free first month, designated payer, rotation, overdue blocking) lives in sync_group_subscription() + src/lib/tontines/subscription.functions.ts; cycles stored in group_subscriptions (tontine_id, cycle_idx). Why: one server-side source of truth, confirmed only by apply_payment_success.
- Disputes/proxy payments/co-admin governance live in member_debts, proxy_payment_requests, group_admin_changes + apply_payment_success + run_group_governance (daily cron); priority enforced by assertDisputePriority in src/lib/tontines/disputes.server.ts. Why: one server-side source of truth for debts and succession.
- Group invitations: one secret invite_token per tontine (/rejoindre/<token>), join requests in tontine_join_requests decided only via src/lib/tontines/invites.functions.ts (dispute flag = existence only). Why: server-side validation, no leak of other groups’ dispute details.
- Protected amounts on user screens render through <Money> (src/components/zuki/Money.tsx), revealed one at a time via RevealProvider PIN/biometric check and re-masked on page change or app backgrounding. Why: one central privacy control per amount.
