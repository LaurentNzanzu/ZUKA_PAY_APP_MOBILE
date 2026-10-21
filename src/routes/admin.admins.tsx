import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { AdminShell, Card, useAdminSession } from "@/components/admin/AdminShell";
import {
  inviteAdmin,
  listAdmins,
  revokeAdmin,
  revokeInvitation,
  setAdminPermissions,
  setAdminStatus,
  transferOwnership,
} from "@/lib/admin/admin.functions";
import { PERMISSION_CATALOG, PERMISSION_CATEGORIES, can } from "@/lib/admin/permissions";

export const Route = createFileRoute("/admin/admins")({
  staticData: { sitemap: false },
  head: () => ({ meta: [
    { title: "Administrateurs et permissions — ZUKA PAY" },
    { name: "description", content: "Gérez les administrateurs, rôles et permissions ZUKA PAY." },
    { property: "og:title", content: "Administrateurs et permissions — ZUKA PAY" },
    { property: "og:description", content: "Gérez les administrateurs, rôles et permissions ZUKA PAY." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: () => (
    <AdminShell title="Administrateurs" permission="admins.view">
      <Admins />
    </AdminShell>
  ),
});

function Admins() {
  const { data: session } = useAdminSession();
  const manage = can(session, "admins.manage");
  const queryClient = useQueryClient();

  const fetchAdmins = useServerFn(listAdmins);
  const invite = useServerFn(inviteAdmin);
  const revokeInvite = useServerFn(revokeInvitation);
  const setPerms = useServerFn(setAdminPermissions);
  const setStatus = useServerFn(setAdminStatus);
  const revoke = useServerFn(revokeAdmin);
  const transfer = useServerFn(transferOwnership);

  const { data, isLoading } = useQuery({ queryKey: ["admin-admins"], queryFn: () => fetchAdmins(), retry: false });

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "super_admin">("admin");
  const [invitePerms, setInvitePerms] = useState<string[]>([]);
  const [editing, setEditing] = useState<{ userId: string; permissions: string[] } | null>(null);
  const [transferTo, setTransferTo] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [keepAsAdmin, setKeepAsAdmin] = useState(true);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-admins"] });
  const onError = (e: Error) => toast.error(translate(e.message));

  const inviteMutation = useMutation({
    mutationFn: () =>
      invite({
        data: {
          email: inviteEmail,
          role: inviteRole,
          permissions: inviteRole === "super_admin" ? [] : invitePerms,
          origin: window.location.origin,
        },
      }),
    onSuccess: async (res) => {
      setInviteOpen(false);
      setInviteEmail("");
      setInvitePerms([]);
      await refresh();
      toast[res.emailSent ? "success" : "warning"](
        res.emailSent ? "Invitation envoyée par email." : "Invitation créée, mais l'email n'a pas pu être envoyé.",
      );
    },
    onError,
  });

  const permsMutation = useMutation({
    mutationFn: (v: { userId: string; permissions: string[] }) => setPerms({ data: v }),
    onSuccess: async () => {
      setEditing(null);
      await refresh();
      toast.success("Permissions mises à jour.");
    },
    onError,
  });

  const statusMutation = useMutation({
    mutationFn: (v: { userId: string; status: "active" | "suspended" }) => setStatus({ data: v }),
    onSuccess: async () => {
      await refresh();
      toast.success("Statut mis à jour.");
    },
    onError,
  });

  const revokeMutation = useMutation({
    mutationFn: (userId: string) => revoke({ data: { userId } }),
    onSuccess: async () => {
      await refresh();
      toast.success("Accès révoqué.");
    },
    onError,
  });

  const invitationMutation = useMutation({
    mutationFn: (id: string) => revokeInvite({ data: { id } }),
    onSuccess: async () => {
      await refresh();
      toast.success("Invitation révoquée.");
    },
    onError,
  });

  const transferMutation = useMutation({
    mutationFn: () => transfer({ data: { userId: transferTo, confirmEmail, keepAsAdmin } }),
    onSuccess: async () => {
      setTransferTo("");
      setConfirmEmail("");
      await queryClient.invalidateQueries();
      toast.success("Propriété transférée.");
    },
    onError,
  });

  const admins = data?.admins ?? [];
  const invitations = data?.invitations ?? [];

  return (
    <div className="space-y-6">
      <Card
        title={`${admins.length} administrateur(s)`}
        action={
          manage && (
            <button
              type="button"
              onClick={() => setInviteOpen((v) => !v)}
              className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground"
            >
              Ajouter un administrateur
            </button>
          )
        }
      >
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="pb-2">Email</th>
                  <th className="pb-2">Rôle</th>
                  <th className="pb-2">Permissions</th>
                  <th className="pb-2">Statut</th>
                  <th className="pb-2">Créé le</th>
                  <th className="pb-2">Dernière connexion</th>
                  {manage && <th className="pb-2" />}
                </tr>
              </thead>
              <tbody>
                {admins.map((a) => (
                  <tr key={a.userId} className="border-t border-border align-top">
                    <td className="py-2 font-medium">{a.email}</td>
                    <td>{a.role === "super_admin" ? "Super admin" : "Admin"}</td>
                    <td className="max-w-xs text-xs text-muted-foreground">
                      {a.role === "super_admin" ? "Toutes" : a.permissions.join(", ") || "—"}
                    </td>
                    <td>{a.status === "active" ? "Actif" : "Suspendu"}</td>
                    <td>{new Date(a.createdAt).toLocaleDateString("fr-FR")}</td>
                    <td>{a.lastLoginAt ? new Date(a.lastLoginAt).toLocaleString("fr-FR") : "—"}</td>
                    {manage && (
                      <td className="space-x-3 whitespace-nowrap text-right text-xs">
                        {a.role !== "super_admin" && (
                          <>
                            <button
                              type="button"
                              className="underline"
                              onClick={() => setEditing({ userId: a.userId, permissions: a.permissions })}
                            >
                              Permissions
                            </button>
                            <button
                              type="button"
                              className="underline"
                              onClick={() =>
                                statusMutation.mutate({
                                  userId: a.userId,
                                  status: a.status === "active" ? "suspended" : "active",
                                })
                              }
                            >
                              {a.status === "active" ? "Suspendre" : "Réactiver"}
                            </button>
                            <button
                              type="button"
                              className="underline"
                              onClick={() => {
                                if (confirm(`Révoquer définitivement l'accès de ${a.email} ?`))
                                  revokeMutation.mutate(a.userId);
                              }}
                            >
                              Révoquer
                            </button>
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {inviteOpen && manage && (
        <Card title="Inviter un administrateur">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              inviteMutation.mutate();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-semibold text-muted-foreground">
                  Adresse email professionnelle
                </span>
                <input
                  required
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="input"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-semibold text-muted-foreground">Rôle</span>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as "admin" | "super_admin")}
                  className="input"
                >
                  <option value="admin">Administrateur</option>
                  {session?.isSuperAdmin && <option value="super_admin">Super administrateur</option>}
                </select>
              </label>
            </div>

            {inviteRole === "admin" && (
              <PermissionPicker value={invitePerms} onChange={setInvitePerms} />
            )}

            <p className="text-xs text-muted-foreground">
              L'invitation expire après 7 jours. Le compte ne devient administrateur qu'après
              activation depuis l'email reçu.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setInviteOpen(false)} className="rounded-lg bg-muted px-4 py-2 text-sm">
                Annuler
              </button>
              <button
                type="submit"
                disabled={inviteMutation.isPending}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                Envoyer l'invitation
              </button>
            </div>
          </form>
        </Card>
      )}

      {editing && (
        <Card title="Modifier les permissions">
          <PermissionPicker
            value={editing.permissions}
            onChange={(permissions) => setEditing({ ...editing, permissions })}
          />
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(null)} className="rounded-lg bg-muted px-4 py-2 text-sm">
              Annuler
            </button>
            <button
              type="button"
              onClick={() => permsMutation.mutate(editing)}
              disabled={permsMutation.isPending}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              Enregistrer
            </button>
          </div>
        </Card>
      )}

      <Card title={`Invitations (${invitations.length})`}>
        {invitations.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune invitation.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="pb-2">Email</th>
                <th className="pb-2">Rôle</th>
                <th className="pb-2">Statut</th>
                <th className="pb-2">Expire le</th>
                {manage && <th className="pb-2" />}
              </tr>
            </thead>
            <tbody>
              {invitations.map((i) => (
                <tr key={i.id} className="border-t border-border">
                  <td className="py-2">{i.email}</td>
                  <td>{i.role === "super_admin" ? "Super admin" : "Admin"}</td>
                  <td>{i.status}</td>
                  <td>{new Date(i.expiresAt).toLocaleDateString("fr-FR")}</td>
                  {manage && (
                    <td className="text-right text-xs">
                      {i.status === "pending" && (
                        <button type="button" className="underline" onClick={() => invitationMutation.mutate(i.id)}>
                          Révoquer
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {session?.isSuperAdmin && (
        <Card title="Transférer la propriété">
          <p className="text-sm text-muted-foreground">
            Le transfert donne le contrôle total de ZUKA PAY à un autre administrateur actif dont
            l'adresse email est vérifiée. Cette action est irréversible et enregistrée dans le
            journal d'audit.
          </p>
          <form
            className="mt-4 grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (confirm("Confirmer le transfert de propriété ? Vous perdrez le rôle de super administrateur."))
                transferMutation.mutate();
            }}
          >
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold text-muted-foreground">Administrateur destinataire</span>
              <select required value={transferTo} onChange={(e) => setTransferTo(e.target.value)} className="input">
                <option value="">Sélectionner…</option>
                {admins
                  .filter((a) => a.userId !== session.userId && a.status === "active")
                  .map((a) => (
                    <option key={a.userId} value={a.userId}>
                      {a.email}
                    </option>
                  ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold text-muted-foreground">
                Retapez l'email du destinataire
              </span>
              <input required value={confirmEmail} onChange={(e) => setConfirmEmail(e.target.value)} className="input" />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={keepAsAdmin} onChange={(e) => setKeepAsAdmin(e.target.checked)} />
              Rester administrateur après le transfert
            </label>
            <div className="flex justify-end sm:col-span-2">
              <button
                type="submit"
                disabled={transferMutation.isPending || !transferTo}
                className="rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-60"
              >
                Transférer la propriété
              </button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}

function PermissionPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (key: string) =>
    onChange(value.includes(key) ? value.filter((v) => v !== key) : [...value, key]);
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {PERMISSION_CATEGORIES.map((category) => (
        <div key={category} className="rounded-xl border border-border p-3">
          <p className="mb-2 text-xs font-semibold">{category}</p>
          <div className="space-y-1">
            {PERMISSION_CATALOG.filter((p) => p.category === category).map((p) => (
              <label key={p.key} className="flex items-start gap-2 text-xs">
                <input type="checkbox" checked={value.includes(p.key)} onChange={() => toggle(p.key)} />
                <span>{p.label}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function translate(message: string) {
  const map: Record<string, string> = {
    FORBIDDEN: "Vous n'avez pas la permission nécessaire.",
    EMAIL_ALREADY_ADMIN: "Cette adresse email est déjà administratrice active.",
    INVALID_EMAIL: "Adresse email invalide.",
    CANNOT_SUSPEND_SELF: "Vous ne pouvez pas suspendre votre propre compte.",
    CANNOT_REVOKE_SELF: "Vous ne pouvez pas révoquer votre propre accès.",
    CANNOT_SUSPEND_SUPER_ADMIN: "Un super administrateur ne peut pas être suspendu.",
    CANNOT_REVOKE_SUPER_ADMIN: "Un super administrateur ne peut pas être révoqué.",
    CANNOT_EDIT_SUPER_ADMIN: "Les permissions d'un super administrateur ne se modifient pas.",
    CANNOT_TRANSFER_TO_SELF: "Impossible de transférer la propriété à soi-même.",
    CONFIRMATION_MISMATCH: "L'email de confirmation ne correspond pas.",
    TARGET_NOT_ACTIVE: "Le destinataire n'est pas un administrateur actif.",
    TARGET_EMAIL_NOT_VERIFIED: "L'email du destinataire n'est pas vérifié.",
    TRANSFER_IN_PROGRESS: "Un transfert est déjà en cours.",
  };
  return map[message] ?? message;
}
