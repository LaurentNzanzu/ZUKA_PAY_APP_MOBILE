import { translateError } from "@/lib/i18n/errors";
import { createFileRoute, useHydrated, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, LoaderCircle, Smartphone } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import splashLogo from "@/assets/zuka-pay-splash-logo.jpeg.asset.json";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { startTestSession } from "@/lib/auth/dev-login.functions";
import { isTestAccessHost, TEST_ACCESS_ENABLED } from "@/lib/auth/test-access";
import { takePendingInvite } from "@/lib/tontines/pendingInvite";

export const Route = createFileRoute("/connexion")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Connexion" },
      { name: "description", content: "Connectez-vous à ZUKA PAY avec votre numéro de téléphone." },
      { property: "og:title", content: "Connexion" },
      { property: "og:description", content: "Connexion sécurisée à ZUKA PAY par téléphone." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ConnectionPage,
});

import { useI18n, type Tri } from "@/lib/i18n";

function ConnectionPage() {
  const hydrated = useHydrated();
  if (hydrated && TEST_ACCESS_ENABLED && isTestAccessHost(window.location.hostname)) return <TestAccess />;
  return <PhoneLogin />;
}

function TestAccess() {
  const navigate = useNavigate({ from: "/connexion" });
  const goHome = () => {
    const invite = takePendingInvite();
    if (invite) void navigate({ to: "/rejoindre/$token", params: { token: invite }, replace: true });
    else void navigate({ to: "/", replace: true });
  };
  const { L } = useI18n();
  const [loading, setLoading] = useState(false);

  async function enter() {
    setLoading(true);
    try {
      const { tokenHash } = await startTestSession();
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
      if (error) throw error;
      goHome();
    } catch (error) {
      toast.error(L({ fr: "Accès de test indisponible", en: "Test access unavailable", sw: "Ufikiaji wa majaribio haupatikani" }), { description: translateError(error) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="safe-top safe-bottom flex min-h-dvh items-center justify-center bg-background px-5 py-8">
      <section className="w-full max-w-sm text-center" aria-labelledby="login-title">
        <div className="mx-auto grid size-20 place-items-center overflow-hidden rounded-2xl bg-splash shadow-card">
          <img src={splashLogo.url} alt="" width={1536} height={1707} className="h-full w-full object-cover" />
        </div>
        <p className="mt-7 font-display text-sm font-bold text-primary">ZUKA PAY</p>
        <h1 id="login-title" className="mt-2 font-display text-2xl font-bold text-foreground">{L({ fr: "Connexion", en: "Sign in", sw: "Ingia" })}</h1>
        <Button type="button" size="lg" disabled={loading} onClick={() => void enter()} className="mt-8 h-12 w-full rounded-xl font-semibold">
          {loading && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          {L({ fr: "Accéder à l’application", en: "Open the app", sw: "Fungua programu" })}
        </Button>
      </section>
    </main>
  );
}

/** Normalise un numéro saisi vers le format international E.164 (RDC par défaut). */
function normalizePhone(value: string) {
  let compact = value.replace(/[^\d+]/g, "");
  if (compact.startsWith("00")) compact = `+${compact.slice(2)}`;
  if (compact.startsWith("+")) return compact;
  if (compact.startsWith("243")) return `+${compact}`;
  if (compact.startsWith("0")) return `+243${compact.slice(1)}`;
  return `+243${compact}`;
}

/** Traduit les erreurs Supabase Auth en messages compréhensibles. */
function otpErrorText(L: (m: Tri) => string, error: { message: string; code?: string | undefined; status?: number | undefined }) {
  const code = error.code ?? "";
  const message = error.message.toLowerCase();
  if (code === "phone_provider_disabled" || message.includes("unsupported phone provider")) {
    return L({ fr: "La connexion par SMS n'est pas encore activée sur ce compte ZUKA PAY. Le service d'envoi de SMS doit être configuré par l'administrateur avant de pouvoir recevoir un code.", en: "SMS sign-in is not yet enabled for ZUKA PAY. The administrator must configure the SMS service before you can receive a code.", sw: "Kuingia kwa SMS bado hakujawashwa kwenye ZUKA PAY. Msimamizi lazima asanidi huduma ya SMS kabla ya kupokea namba." });
  }
  if (code === "over_sms_send_rate_limit" || error.status === 429) {
    return L({ fr: "Trop de demandes de code. Patientez quelques minutes avant de réessayer.", en: "Too many code requests. Wait a few minutes before trying again.", sw: "Maombi mengi ya namba. Subiri dakika chache kabla ya kujaribu tena." });
  }
  if (code === "invalid_phone" || message.includes("invalid phone")) {
    return L({ fr: "Ce numéro n'est pas valide. Utilisez le format +243 8XX XXX XXX.", en: "This number is not valid. Use the format +243 8XX XXX XXX.", sw: "Namba hii si sahihi. Tumia muundo +243 8XX XXX XXX." });
  }
  if (code === "signup_disabled") {
    return L({ fr: "Les nouvelles inscriptions sont désactivées pour le moment.", en: "New sign-ups are disabled for now.", sw: "Usajili mpya umezimwa kwa sasa." });
  }
  return translateError(error);
}

function PhoneLogin() {
  const navigate = useNavigate({ from: "/connexion" });
  const goHome = () => {
    const invite = takePendingInvite();
    if (invite) void navigate({ to: "/rejoindre/$token", params: { token: invite }, replace: true });
    else void navigate({ to: "/", replace: true });
  };
  const { L } = useI18n();
  const [phone, setPhone] = useState("");
  const [normalizedPhone, setNormalizedPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [loading, setLoading] = useState(false);

  async function sendCode(event: React.FormEvent) {
    event.preventDefault();
    const normalized = normalizePhone(phone);
    if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
      toast.error(L({ fr: "Saisissez un numéro de téléphone valide.", en: "Enter a valid phone number.", sw: "Weka namba sahihi ya simu." }));
      return;
    }

    setLoading(true);
    // shouldCreateUser: true => un numéro déjà enregistré réutilise le même compte,
    // Supabase n'en crée jamais un second pour le même numéro E.164.
    const { error } = await supabase.auth.signInWithOtp({
      phone: normalized,
      options: { channel: "sms", shouldCreateUser: true },
    });
    setLoading(false);
    if (error) {
      toast.error(L({ fr: "Envoi du code impossible", en: "Could not send the code", sw: "Imeshindwa kutuma namba" }), { description: otpErrorText(L, error) });
      return;
    }
    setNormalizedPhone(normalized);
    setStep("code");
    toast.success(L({ fr: "Code envoyé par SMS", en: "Code sent by SMS", sw: "Namba imetumwa kwa SMS" }));
  }


  async function verifyCode(event: React.FormEvent) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      toast.error(L({ fr: "Saisissez le code à 6 chiffres.", en: "Enter the 6-digit code.", sw: "Weka namba ya tarakimu 6." }));
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({ phone: normalizedPhone, token: code, type: "sms" });
    setLoading(false);
    if (error) {
      toast.error(L({ fr: "Code incorrect ou expiré", en: "Wrong or expired code", sw: "Namba si sahihi au imeisha muda" }), { description: otpErrorText(L, error) });
      return;
    }
    toast.success(L({ fr: "Connexion réussie", en: "Signed in", sw: "Umeingia" }));
    goHome();
  }

  return (
    <main className="safe-top safe-bottom flex min-h-dvh items-center justify-center bg-background px-5 py-8">
      <section className="w-full max-w-sm" aria-labelledby="login-title">
        <div className="mx-auto grid size-20 place-items-center overflow-hidden rounded-2xl bg-splash shadow-card">
          <img src={splashLogo.url} alt="" width={1536} height={1707} className="h-full w-full object-cover" />
        </div>

        <div className="mt-7 text-center">
          <p className="font-display text-sm font-bold text-primary">ZUKA PAY</p>
          <h1 id="login-title" className="mt-2 font-display text-2xl font-bold text-foreground">
            {step === "phone" ? L({ fr: "Connexion", en: "Sign in", sw: "Ingia" }) : L({ fr: "Vérifiez votre numéro", en: "Verify your number", sw: "Thibitisha namba yako" })}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {step === "phone"
              ? L({ fr: "Entrez votre numéro Mobile Money pour continuer.", en: "Enter your Mobile Money number to continue.", sw: "Weka namba yako ya Mobile Money ili kuendelea." })
              : L({ fr: `Un code à 6 chiffres a été envoyé au ${normalizedPhone}.`, en: `A 6-digit code was sent to ${normalizedPhone}.`, sw: `Namba ya tarakimu 6 imetumwa kwa ${normalizedPhone}.` })}
          </p>
        </div>

        <form onSubmit={step === "phone" ? sendCode : verifyCode} className="mt-8">
          {step === "phone" ? (
            <>
              <label htmlFor="phone" className="text-sm font-semibold text-foreground">
                {L({ fr: "Numéro de téléphone", en: "Phone number", sw: "Namba ya simu" })}
              </label>
              <div className="mt-2 flex h-13 items-center rounded-xl border border-input bg-card px-4 focus-within:ring-2 focus-within:ring-ring">
                <Smartphone className="mr-3 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <input
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="+243 810 000 000"
                  className="h-full min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
                  required
                />
              </div>
            </>
          ) : (
            <>
              <label htmlFor="otp" className="text-sm font-semibold text-foreground">
                {L({ fr: "Code de confirmation", en: "Confirmation code", sw: "Namba ya uthibitisho" })}
              </label>
              <div className="mt-2 flex h-14 items-center rounded-xl border border-input bg-card px-4 focus-within:ring-2 focus-within:ring-ring">
                <CheckCircle2 className="mr-3 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  className="h-full min-w-0 flex-1 bg-transparent font-mono text-xl tracking-[0.28em] text-foreground outline-none placeholder:text-muted-foreground"
                  required
                />
              </div>
            </>
          )}

          <Button type="submit" size="lg" disabled={loading} className="mt-5 h-12 w-full rounded-xl font-semibold">
            {loading && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            {step === "phone" ? L({ fr: "Recevoir le code", en: "Get the code", sw: "Pokea namba" }) : L({ fr: "Confirmer et continuer", en: "Confirm and continue", sw: "Thibitisha na uendelee" })}
          </Button>

          {step === "code" && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setStep("phone");
                setCode("");
              }}
              className="mt-2 w-full"
            >
              <ArrowLeft aria-hidden="true" />
              {L({ fr: "Modifier le numéro", en: "Change number", sw: "Badilisha namba" })}
            </Button>
          )}
        </form>
      </section>
    </main>
  );
}