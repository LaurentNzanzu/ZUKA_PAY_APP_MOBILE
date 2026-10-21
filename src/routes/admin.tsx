import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/admin")({
  staticData: { sitemap: "exclude-subtree" },
  ssr: false,
  head: () => ({
    meta: [
      { title: "Back-office ZUKA PAY — Administration de la plateforme" },
      {
        name: "description",
        content:
          "Espace d'administration ZUKA PAY : administrateurs, permissions, tarification des groupes, abonnements, fournisseurs Mobile Money et journal d'audit.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Back-office ZUKA PAY" },
      { property: "og:description", content: "Administration sécurisée de la plateforme ZUKA PAY." },
    ],
  }),
  component: () => <Outlet />,
});
