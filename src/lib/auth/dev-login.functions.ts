import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { isTestAccessHost, TEST_ACCESS_ENABLED } from "./test-access";

/**
 * Mode test temporaire. Ne fonctionne que dans l'éditeur et l'aperçu,
 * et n'attribue aucun rôle administrateur. L'OTP téléphonique reste disponible
 * sur la page de connexion publiée. Désactiver TEST_ACCESS_ENABLED pour revenir
 * au parcours normal dans l'aperçu.
 */
export const startTestSession = createServerFn({ method: "POST" })
  .handler(async () => {
    const request = getRequest();
    if (!TEST_ACCESS_ENABLED || !isTestAccessHost(new URL(request.url).hostname)) {
      throw new Error("Accès de test indisponible sur ce site.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = "preview-access@zukapay.cash";
    const { error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: "Accès de test" },
    });
    if (createError && !/already|registered|exists/i.test(createError.message)) {
      throw new Error("Impossible de préparer le compte de test.");
    }
    const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({ type: "magiclink", email });
    if (error || !link.properties?.hashed_token) throw new Error("Impossible d'ouvrir la session de test.");
    if (link.user?.id) {
      const { error: profileError } = await supabaseAdmin.from("profiles").upsert(
        { id: link.user.id, email, full_name: "Accès de test" },
        { onConflict: "id" },
      );
      if (profileError) throw new Error("Impossible de préparer le profil de test.");
    }
    return { tokenHash: link.properties.hashed_token };
  });
