export const PERMISSION_CATALOG = [
  { key: "users.view", category: "Utilisateurs", label: "Consulter les utilisateurs" },
  { key: "users.manage", category: "Utilisateurs", label: "Gérer les utilisateurs" },
  { key: "users.suspend", category: "Utilisateurs", label: "Suspendre un utilisateur" },
  { key: "groups.view", category: "Groupes", label: "Consulter les groupes" },
  { key: "groups.manage", category: "Groupes", label: "Gérer les groupes" },
  { key: "groups.suspend", category: "Groupes", label: "Suspendre un groupe" },
  { key: "transactions.view", category: "Transactions", label: "Consulter les transactions" },
  { key: "transactions.manage", category: "Transactions", label: "Gérer les transactions" },
  { key: "transactions.refund", category: "Transactions", label: "Rembourser une transaction" },
  { key: "payments.view", category: "Paiements", label: "Consulter les abonnements" },
  { key: "payments.manage", category: "Paiements", label: "Gérer les abonnements" },
  { key: "mobile_money.view", category: "Mobile Money", label: "Consulter les fournisseurs" },
  { key: "mobile_money.manage", category: "Mobile Money", label: "Gérer les fournisseurs" },
  { key: "pricing.view", category: "Tarification", label: "Consulter les tarifs" },
  { key: "pricing.manage", category: "Tarification", label: "Gérer les tarifs" },
  { key: "reports.view", category: "Rapports", label: "Consulter les rapports" },
  { key: "reports.export", category: "Rapports", label: "Exporter les rapports" },
  { key: "admins.view", category: "Administration", label: "Consulter les administrateurs" },
  { key: "admins.manage", category: "Administration", label: "Gérer les administrateurs" },
  { key: "settings.view", category: "Paramètres", label: "Consulter les paramètres" },
  { key: "settings.manage", category: "Paramètres", label: "Gérer les paramètres" },
] as const;

export type PermissionKey = (typeof PERMISSION_CATALOG)[number]["key"];

export const PERMISSION_CATEGORIES = Array.from(
  new Set(PERMISSION_CATALOG.map((p) => p.category)),
);

export interface AdminSession {
  userId: string;
  email: string;
  fullName: string | null;
  role: "super_admin" | "admin" | "user";
  status: "active" | "suspended" | "none";
  permissions: string[];
  isSuperAdmin: boolean;
  isAdmin: boolean;
  /** true when the platform has no super admin yet */
  needsBootstrap: boolean;
}

export function can(session: AdminSession | null | undefined, permission: string) {
  if (!session || !session.isAdmin || session.status !== "active") return false;
  if (session.isSuperAdmin) return true;
  return session.permissions.includes(permission);
}
