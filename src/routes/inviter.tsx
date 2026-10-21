import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/zuki/Shell";
import { GroupPicker } from "@/components/zuki/GroupPicker";
import { GroupInvites } from "@/components/zuki/GroupInvites";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/inviter")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Inviter dans un groupe — ZUKA PAY" },
      { name: "description", content: "Partagez le lien personnalisé et le QR Code d'invitation de votre groupe." },
      { property: "og:title", content: "Inviter dans un groupe — ZUKA PAY" },
      { property: "og:description", content: "Lien personnalisé et QR Code d'invitation ZUKA PAY." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InvitePage,
});

function InvitePage() {
  const { t } = useI18n();
  return (
    <Shell>
      <GroupPicker title={t("qa.invite")}>
        {(g) => <GroupInvites tontineId={g.id} groupName={g.name} />}
      </GroupPicker>
    </Shell>
  );
}
