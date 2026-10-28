import { translateError } from "@/lib/i18n/errors";
import { createFileRoute, useHydrated, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  CheckCircle2,
  LoaderCircle,
  MessageSquare,
  RotateCcw,
  Smartphone,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import zukaLogo from "@/assets/zuka-logo.png";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { startTestSession } from "@/lib/auth/dev-login.functions";
import { sendOtp, verifyOtp } from "@/lib/auth/otp.functions";
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
  const [showPhoneLogin, setShowPhoneLogin] = useState(false);
  if (
    hydrated &&
    TEST_ACCESS_ENABLED &&
    isTestAccessHost(window.location.hostname) &&
    !showPhoneLogin
  ) {
    return <TestAccess onUsePhone={() => setShowPhoneLogin(true)} />;
  }
  return (
    <PhoneLogin
      onBackToTest={() => setShowPhoneLogin(false)}
      showBackToTest={Boolean(
        hydrated &&
        TEST_ACCESS_ENABLED &&
        typeof window !== "undefined" &&
        isTestAccessHost(window.location.hostname),
      )}
    />
  );
}

function TestAccess({ onUsePhone }: { onUsePhone?: () => void }) {
  const navigate = useNavigate({ from: "/connexion" });
  const goHome = () => {
    const invite = takePendingInvite();
    if (invite)
      void navigate({ to: "/rejoindre/$token", params: { token: invite }, replace: true });
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
      toast.error(
        L({
          fr: "Accès de test indisponible",
          en: "Test access unavailable",
          sw: "Ufikiaji wa majaribio haupatikani",
        }),
        { description: translateError(error) },
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="safe-top safe-bottom flex min-h-dvh items-center justify-center bg-background px-5 py-8">
      <section className="w-full max-w-sm text-center" aria-labelledby="login-title">
        <div className="mx-auto grid size-20 place-items-center overflow-hidden rounded-2xl bg-splash shadow-card">
          <img
            src={zukaLogo}
            alt="ZUKA PAY"
            width={1536}
            height={1707}
            className="h-full w-full object-cover"
          />
        </div>
        <p className="mt-7 font-display text-sm font-bold text-primary">ZUKA PAY</p>
        <h1 id="login-title" className="mt-2 font-display text-2xl font-bold text-foreground">
          {L({ fr: "Connexion", en: "Sign in", sw: "Ingia" })}
        </h1>
        <Button
          type="button"
          size="lg"
          disabled={loading}
          onClick={() => void enter()}
          className="mt-8 h-12 w-full rounded-xl font-semibold"
        >
          {loading && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          {L({ fr: "Accéder à l’application", en: "Open the app", sw: "Fungua programu" })}
        </Button>
        {onUsePhone && (
          <Button
            type="button"
            variant="ghost"
            onClick={onUsePhone}
            className="mt-3 h-10 w-full rounded-xl text-xs text-muted-foreground hover:text-foreground"
          >
            <Smartphone className="mr-1.5 size-3.5" aria-hidden="true" />
            {L({
              fr: "Connexion par numéro (WhatsApp / SMS)",
              en: "Sign in with phone number (WhatsApp / SMS)",
              sw: "Ingia kwa namba ya simu (WhatsApp / SMS)",
            })}
          </Button>
        )}
      </section>
    </main>
  );
}

/** Normalise un numéro saisi vers le format international E.164 (RDC par défaut). */
function normalizePhone(value: string) {
  let compact = value.replace(/[^\d+]/g, "");
  if (compact.startsWith("00")) compact = compact.slice(2);
  if (compact.startsWith("+")) compact = compact.slice(1);
  if (compact.startsWith("243")) return compact;
  if (compact.startsWith("0")) return `243${compact.slice(1)}`;
  return `243${compact}`;
}

/** Traduit les erreurs de l'authentification OTP en messages compréhensibles pour l'utilisateur. */
function formatOtpError(L: (m: Tri) => string, code: string, retryAfter?: number): string {
  switch (code) {
    case "INVALID_PHONE":
      return L({
        fr: "Ce numéro n'est pas valide. Utilisez le format +243 8XX XXX XXX.",
        en: "This phone number is not valid. Use the format +243 8XX XXX XXX.",
        sw: "Namba hii ya simu si sahihi. Tumia muundo +243 8XX XXX XXX.",
      });
    case "COOLDOWN":
      return L({
        fr: `Veuillez patienter ${retryAfter ?? 60} secondes avant de demander un nouveau code.`,
        en: `Please wait ${retryAfter ?? 60} seconds before requesting a new code.`,
        sw: `Tafadhali subiri sekunde ${retryAfter ?? 60} kabla ya kuomba namba mpya.`,
      });
    case "PHONE_LIMIT":
      return L({
        fr: "Trop de tentatives pour ce numéro. Veuillez réessayer après 10 minutes.",
        en: "Too many attempts for this number. Please try again in 10 minutes.",
        sw: "Majaribio mengi sana kwa namba hii. Tafadhali jaribu tena baada ya dakika 10.",
      });
    case "IP_LIMIT":
      return L({
        fr: "Trop de demandes depuis votre connexion réseau. Réessayez dans une heure.",
        en: "Too many requests from your network connection. Try again in an hour.",
        sw: "Maombi mengi sana kutoka kwa mtandao wako. Jaribu tena baada ya saa moja.",
      });
    case "GLOBAL_LIMIT":
      return L({
        fr: "Le service d'authentification est temporairement saturé. Réessayez dans quelques instants.",
        en: "The authentication service is temporarily overloaded. Please try again shortly.",
        sw: "Huduma ya uthibitisho imelemewa kwa sasa. Jaribu tena baada ya muda mfupi.",
      });
    case "SEND_FAILED":
      return L({
        fr: "Impossible d'envoyer le code pour le moment. Vérifiez votre numéro et réessayez.",
        en: "Could not send the code at this time. Check your number and try again.",
        sw: "Imeshindwa kutuma namba kwa sasa. Angalia namba yako kisha ujaribu tena.",
      });
    case "INVALID_CODE_FORMAT":
      return L({
        fr: "Le code de confirmation doit comporter exactement 6 chiffres.",
        en: "The confirmation code must be exactly 6 digits.",
        sw: "Namba ya uthibitisho lazima iwe na tarakimu 6 kamili.",
      });
    case "INVALID_OR_EXPIRED":
      return L({
        fr: "Code incorrect ou expiré. Vérifiez le code reçu ou demandez-en un nouveau.",
        en: "Incorrect or expired code. Check the code you received or request a new one.",
        sw: "Namba si sahihi au imeisha muda. Angalia namba uliyopokea au uombe mpya.",
      });
    case "TOO_MANY_ATTEMPTS":
      return L({
        fr: "Trop de tentatives incorrectes. Ce code a été invalidé, veuillez en demander un nouveau.",
        en: "Too many incorrect attempts. This code has been invalidated, please request a new one.",
        sw: "Majaribio mengi yasiyo sahihi. Namba hii imebatilishwa, tafadhali omba mpya.",
      });
    case "SESSION_FAILED":
      return L({
        fr: "Impossible d'établir la session de connexion. Veuillez réessayer ou contacter le support.",
        en: "Could not establish the login session. Please try again or contact support.",
        sw: "Imeshindwa kufungua kipindi cha kuingia. Tafadhali jaribu tena au wasiliana na usaidizi.",
      });
    default:
      return L({
        fr: "Une erreur est survenue lors de l'authentification.",
        en: "An error occurred during authentication.",
        sw: "Hitilafu imetokea wakati wa uthibitisho.",
      });
  }
}

function PhoneLogin({
  onBackToTest,
  showBackToTest,
}: { onBackToTest?: () => void; showBackToTest?: boolean } = {}) {
  const navigate = useNavigate({ from: "/connexion" });
  const goHome = () => {
    const invite = takePendingInvite();
    if (invite)
      void navigate({ to: "/rejoindre/$token", params: { token: invite }, replace: true });
    else void navigate({ to: "/", replace: true });
  };
  const { L } = useI18n();
  const [phone, setPhone] = useState("");
  const [normalizedPhone, setNormalizedPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [channel, setChannel] = useState<"whatsapp" | "sms">("whatsapp");
  const [cooldown, setCooldown] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => {
      setCooldown((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  async function performSendOtp(targetPhone: string) {
    if (loading) return false;
    setLoading(true);
    try {
      const res = await sendOtp({ data: { phone: targetPhone } });
      if (!res.ok) {
        if (res.code === "COOLDOWN" && res.retryAfter) {
          setCooldown(res.retryAfter);
        }
        toast.error(
          L({
            fr: "Envoi du code impossible",
            en: "Could not send the code",
            sw: "Imeshindwa kutuma namba",
          }),
          { description: formatOtpError(L, res.code, res.retryAfter) },
        );
        return false;
      }

      setChannel(res.channel);
      setNormalizedPhone(targetPhone);
      setStep("code");
      setCooldown(60);

      if (res.channel === "whatsapp") {
        toast.success(
          L({
            fr: "Code envoyé par WhatsApp",
            en: "Code sent via WhatsApp",
            sw: "Namba imetumwa kwa WhatsApp",
          }),
        );
      } else {
        toast.success(
          L({
            fr: "Code envoyé par SMS",
            en: "Code sent by SMS",
            sw: "Namba imetumwa kwa SMS",
          }),
        );
      }
      return true;
    } catch (error) {
      toast.error(
        L({
          fr: "Envoi du code impossible",
          en: "Could not send the code",
          sw: "Imeshindwa kutuma namba",
        }),
        { description: translateError(error) },
      );
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function sendCode(event: React.FormEvent) {
    event.preventDefault();
    const normalized = normalizePhone(phone);
    if (!/^243\d{9}$/.test(normalized)) {
      toast.error(
        L({
          fr: "Saisissez un numéro de téléphone valide.",
          en: "Enter a valid phone number.",
          sw: "Weka namba sahihi ya simu.",
        }),
      );
      return;
    }
    await performSendOtp(normalized);
  }

  async function handleResendCode() {
    if (cooldown > 0 || !normalizedPhone || loading) return;
    await performSendOtp(normalizedPhone);
  }

  async function verifyCode(event: React.FormEvent) {
    event.preventDefault();
    if (loading) return;

    const cleanCode = code.replace(/\D/g, "");
    if (!/^\d{6}$/.test(cleanCode)) {
      toast.error(
        L({
          fr: "Saisissez le code à 6 chiffres.",
          en: "Enter the 6-digit code.",
          sw: "Weka namba ya tarakimu 6.",
        }),
      );
      return;
    }

    setLoading(true);
    try {
      const res = await verifyOtp({
        data: {
          phone: normalizedPhone,
          code: cleanCode,
        },
      });

      if (!res.ok) {
        toast.error(
          L({
            fr: "Code invalide",
            en: "Invalid code",
            sw: "Namba si sahihi",
          }),
          { description: formatOtpError(L, res.code) },
        );
        return;
      }

      // Établissement de la session Supabase via le tokenHash généré par le serveur
      const { data: sessionData, error: sessionError } = await supabase.auth.verifyOtp({
        token_hash: res.tokenHash,
        type: "magiclink",
      });

      if (sessionError || !sessionData?.session) {
        toast.error(
          L({
            fr: "Échec de l'ouverture de session",
            en: "Failed to open session",
            sw: "Imeshindwa kufungua kipindi",
          }),
          { description: sessionError ? translateError(sessionError) : undefined },
        );
        return;
      }

      toast.success(L({ fr: "Connexion réussie", en: "Signed in", sw: "Umeingia" }));
      goHome();
    } catch (error) {
      toast.error(
        L({
          fr: "Erreur de connexion",
          en: "Sign-in error",
          sw: "Hitilafu ya kuingia",
        }),
        { description: translateError(error) },
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="safe-top safe-bottom flex min-h-dvh items-center justify-center bg-background px-5 py-8">
      <section className="w-full max-w-sm" aria-labelledby="login-title">
        <div className="mx-auto grid size-20 place-items-center overflow-hidden rounded-2xl bg-splash shadow-card">
          <img
            src={zukaLogo}
            alt="ZUKA PAY"
            width={1536}
            height={1707}
            className="h-full w-full object-cover"
          />
        </div>

        <div className="mt-7 text-center">
          <p className="font-display text-sm font-bold text-primary">ZUKA PAY</p>
          <h1 id="login-title" className="mt-2 font-display text-2xl font-bold text-foreground">
            {step === "phone"
              ? L({ fr: "Connexion", en: "Sign in", sw: "Ingia" })
              : L({
                  fr: "Vérifiez votre numéro",
                  en: "Verify your number",
                  sw: "Thibitisha namba yako",
                })}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {step === "phone"
              ? L({
                  fr: "Entrez votre numéro Mobile Money pour continuer.",
                  en: "Enter your Mobile Money number to continue.",
                  sw: "Weka namba yako ya Mobile Money ili kuendelea.",
                })
              : channel === "whatsapp"
                ? L({
                    fr: `Un code à 6 chiffres a été envoyé par WhatsApp au ${normalizedPhone}.`,
                    en: `A 6-digit code was sent via WhatsApp to ${normalizedPhone}.`,
                    sw: `Namba ya tarakimu 6 imetumwa kwa WhatsApp kwa ${normalizedPhone}.`,
                  })
                : L({
                    fr: `Un code à 6 chiffres a été envoyé par SMS au ${normalizedPhone}.`,
                    en: `A 6-digit code was sent by SMS to ${normalizedPhone}.`,
                    sw: `Namba ya tarakimu 6 imetumwa kwa SMS kwa ${normalizedPhone}.`,
                  })}
          </p>

          {step === "code" && (
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <MessageSquare className="size-3.5" aria-hidden="true" />
              <span>
                {channel === "whatsapp"
                  ? L({ fr: "Canal : WhatsApp", en: "Channel: WhatsApp", sw: "Njia: WhatsApp" })
                  : L({
                      fr: "Canal : SMS de secours",
                      en: "Channel: Backup SMS",
                      sw: "Njia: SMS ya dharura",
                    })}
              </span>
            </div>
          )}
        </div>

        <form onSubmit={step === "phone" ? sendCode : verifyCode} className="mt-8">
          {step === "phone" ? (
            <>
              <label htmlFor="phone" className="text-sm font-semibold text-foreground">
                {L({ fr: "Numéro de téléphone", en: "Phone number", sw: "Namba ya simu" })}
              </label>
              <div className="mt-2 flex h-13 items-center rounded-xl border border-input bg-card px-4 focus-within:ring-2 focus-within:ring-ring">
                <Smartphone
                  className="mr-3 size-5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
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
                {L({
                  fr: "Code de confirmation",
                  en: "Confirmation code",
                  sw: "Namba ya uthibitisho",
                })}
              </label>
              <div className="mt-2 flex h-14 items-center rounded-xl border border-input bg-card px-4 focus-within:ring-2 focus-within:ring-ring">
                <CheckCircle2
                  className="mr-3 size-5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
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

          <Button
            type="submit"
            size="lg"
            disabled={loading}
            className="mt-5 h-12 w-full rounded-xl font-semibold"
          >
            {loading && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            {step === "phone"
              ? L({ fr: "Recevoir le code", en: "Get the code", sw: "Pokea namba" })
              : L({
                  fr: "Confirmer et continuer",
                  en: "Confirm and continue",
                  sw: "Thibitisha na uendelee",
                })}
          </Button>

          {step === "phone" && showBackToTest && onBackToTest && (
            <Button
              type="button"
              variant="ghost"
              onClick={onBackToTest}
              className="mt-2 h-10 w-full rounded-xl text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="mr-1.5 size-3.5" aria-hidden="true" />
              {L({
                fr: "Revenir à l’accès de test",
                en: "Back to test access",
                sw: "Rudi kwenye ufikiaji wa majaribio",
              })}
            </Button>
          )}

          {step === "code" && (
            <div className="mt-3 flex flex-col gap-2">
              <Button
                type="button"
                variant="outline"
                size="default"
                disabled={loading || cooldown > 0}
                onClick={() => void handleResendCode()}
                className="h-11 w-full rounded-xl text-sm font-medium"
              >
                <RotateCcw className="mr-2 size-4" aria-hidden="true" />
                {cooldown > 0
                  ? L({
                      fr: `Renvoyer le code (${cooldown}s)`,
                      en: `Resend code (${cooldown}s)`,
                      sw: `Tuma namba tena (${cooldown}s)`,
                    })
                  : L({
                      fr: "Renvoyer le code",
                      en: "Resend code",
                      sw: "Tuma namba tena",
                    })}
              </Button>

              <Button
                type="button"
                variant="ghost"
                disabled={loading}
                onClick={() => {
                  setStep("phone");
                  setCode("");
                }}
                className="h-11 w-full rounded-xl text-sm"
              >
                <ArrowLeft className="mr-2 size-4" aria-hidden="true" />
                {L({ fr: "Modifier le numéro", en: "Change number", sw: "Badilisha namba" })}
              </Button>
            </div>
          )}
        </form>
      </section>
    </main>
  );
}
