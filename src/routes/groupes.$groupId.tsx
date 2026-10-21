import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/groupes/$groupId")({
  staticData: { sitemap: false },
  component: () => <Outlet />,
});
