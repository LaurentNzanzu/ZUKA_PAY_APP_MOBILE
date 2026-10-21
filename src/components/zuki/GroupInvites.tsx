import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import QRCode from "qrcode";
import { toast } from "sonner";
import { AlertTriangle, Download, Link2, Printer, QrCode, RefreshCw, Share2, UserPlus } from "lucide-react";
import logo from "@/assets/zuka-logo-mark.png.asset.json";
import { SectionTitle } from "@/components/zuki/Shell";
import { currentLang, pick, useI18n } from "@/lib/i18n";
import { translateError } from "@/lib/i18n/errors";

const L = (fr: string, en: string, sw: string) => pick(currentLang(), { fr, en, sw });
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { decideJoinRequest, getGroupInvites, rotateInviteLink } from "@/lib/tontines/invites.functions";

const PUBLIC_ORIGIN = "https://zukapay.cash";

function inviteUrl(token: string) {
  const origin =
    typeof window !== "undefined" && /zukapay\.cash$/.test(window.location.hostname) ? window.location.origin : PUBLIC_ORIGIN;
  return `${origin}/rejoindre/${token}`;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Branded invitation card (logo + group name + QR) as a PNG blob. */
async function renderCard(url: string, groupName: string): Promise<Blob> {
  const W = 900;
  const H = 1200;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  // Printed card: fixed brand palette, independent of the app theme.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#0b5d4b";
  ctx.fillRect(0, 0, W, 220);
  const mark = await loadImage(logo.url);
  if (mark) ctx.drawImage(mark, 60, 55, 110, 114);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 64px sans-serif";
  ctx.fillText("ZUKA PAY", 195, 135);
  ctx.fillStyle = "#0b3b31";
  ctx.textAlign = "center";
  ctx.font = "bold 30px sans-serif";
  ctx.fillText(L("INVITATION À REJOINDRE", "INVITATION TO JOIN", "MWALIKO WA KUJIUNGA"), W / 2, 300);
  let size = 60;
  ctx.font = `bold ${size}px sans-serif`;
  while (ctx.measureText(groupName).width > W - 100 && size > 28) ctx.font = `bold ${(size -= 4)}px sans-serif`;
  ctx.fillText(groupName, W / 2, 380);
  const qr = document.createElement("canvas");
  await QRCode.toCanvas(qr, url, { width: 620, margin: 1, errorCorrectionLevel: "H", color: { dark: "#0b3b31", light: "#ffffff" } });
  ctx.drawImage(qr, (W - 620) / 2, 420);
  ctx.fillStyle = "#4b5b57";
  ctx.font = "26px sans-serif";
  ctx.fillText(L("Scannez avec l'appareil photo de votre téléphone", "Scan with your phone camera", "Changanua kwa kamera ya simu yako"), W / 2, 1100);
  ctx.font = "22px monospace";
  ctx.fillText(url.replace(/^https:\/\//, "").slice(0, 60), W / 2, 1145);
  return await new Promise((resolve) => c.toBlob((b) => resolve(b!), "image/png"));
}

export function GroupInvites({ tontineId, groupName }: { tontineId: string; groupName: string }) {
  const { uiLang } = useI18n();
  const qc = useQueryClient();
  const key = ["group-invites", tontineId];
  const fetchInvites = useServerFn(getGroupInvites);
  const decide = useServerFn(decideJoinRequest);
  const rotate = useServerFn(rotateInviteLink);
  const { data } = useQuery({ queryKey: key, queryFn: () => fetchInvites({ data: { groupId: tontineId } }) });
  const [qrOpen, setQrOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [cardBlob, setCardBlob] = useState<Blob | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const url = data?.isAdmin ? inviteUrl(data.token) : "";

  // Render the card once when shown; every action reuses this exact image so
  // the click handlers stay synchronous (browsers require a direct user gesture
  // for share/download/print, which was lost when we re-rendered on click).
  useEffect(() => {
    if (!qrOpen || !url) return;
    let revoke: string | null = null;
    let alive = true;
    setPreview(null);
    setCardBlob(null);
    renderCard(url, groupName)
      .then((b) => {
        if (!alive) return;
        revoke = URL.createObjectURL(b);
        setCardBlob(b);
        setPreview(revoke);
      })
      .catch(() => toast.error(L("Impossible de générer le QR Code. Réessayez.", "Could not generate the QR Code. Try again.", "Imeshindwa kutengeneza QR Code. Jaribu tena.")));
    return () => {
      alive = false;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [qrOpen, url, groupName, uiLang]);

  if (!data?.isAdmin) return null;

  const fileName = `ZUKA-PAY-invitation-${groupName.replace(/[^\w-]+/g, "-").slice(0, 40)}.png`;

  async function shareLink() {
    const text = L(`Rejoignez la tontine « ${groupName} » sur ZUKA PAY`, `Join the group "${groupName}" on ZUKA PAY`, `Jiunge na kikundi "${groupName}" kwenye ZUKA PAY`);
    if (navigator.share) {
      try {
        await navigator.share({ title: "ZUKA PAY", text, url });
        return;
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success(L("Lien d'invitation copié", "Invitation link copied", "Kiungo cha mwaliko kimenakiliwa"));
    } catch {
      toast.error(L("Copie impossible. Sélectionnez le lien et copiez-le manuellement.", "Copy failed. Select the link and copy it manually.", "Imeshindwa kunakili. Chagua kiungo na ukinakili mwenyewe."));
    }
  }

  function notReady() {
    toast.error(L("Le QR Code est en cours de préparation, réessayez dans un instant.", "The QR Code is being prepared, try again in a moment.", "QR Code inaandaliwa, jaribu tena baada ya muda mfupi."));
  }

  function download() {
    if (!cardBlob || !preview) return notReady();
    try {
      const a = document.createElement("a");
      a.href = preview;
      a.download = fileName;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success(L("QR Code téléchargé avec succès", "QR Code downloaded successfully", "QR Code imepakuliwa"));
    } catch {
      toast.error(L("Le téléchargement a échoué. Maintenez l'image appuyée pour l'enregistrer.", "Download failed. Press and hold the image to save it.", "Upakuaji umeshindwa. Bonyeza picha kwa muda ili kuihifadhi."));
    }
  }

  function shareQr() {
    if (!cardBlob) return notReady();
    const file = new File([cardBlob], fileName, { type: "image/png" });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      navigator
        .share({ files: [file], title: "ZUKA PAY", text: `${L("Invitation", "Invitation", "Mwaliko")}: ${groupName}\n${url}` })
        .then(() => toast.success(L("QR Code partagé avec succès", "QR Code shared successfully", "QR Code imeshirikiwa")))
        .catch((e: Error) => {
          if (e?.name !== "AbortError") toast.error(L("Le partage a échoué. Le QR Code va être téléchargé.", "Sharing failed. The QR Code will be downloaded.", "Kushiriki kumeshindwa. QR Code itapakuliwa."));
          if (e?.name !== "AbortError") download();
        });
      return;
    }
    // No native file sharing (desktop browsers): save the image instead.
    download();
    toast.info(L("Partage direct indisponible sur cet appareil : image enregistrée, envoyez-la depuis vos fichiers.", "Direct sharing is unavailable on this device: image saved, send it from your files.", "Kushiriki moja kwa moja hakupatikani: picha imehifadhiwa, itume kutoka kwenye faili zako."));
  }

  function print() {
    if (!preview) return notReady();
    try {
      const frame = document.createElement("iframe");
      frame.setAttribute("aria-hidden", "true");
      frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
      document.body.appendChild(frame);
      const doc = frame.contentDocument!;
      doc.open();
      doc.write(
        `<html><head><title>${fileName}</title><style>@page{size:A4 portrait;margin:12mm}html,body{margin:0;height:100%}body{display:flex;align-items:center;justify-content:center}img{max-width:100%;max-height:100%;object-fit:contain}</style></head><body><img src="${preview}"></body></html>`,
      );
      doc.close();
      const img = doc.querySelector("img")!;
      const go = () => {
        toast.success(L("QR Code prêt à être imprimé", "QR Code ready to print", "QR Code iko tayari kuchapishwa"));
        frame.contentWindow!.focus();
        frame.contentWindow!.print();
        setTimeout(() => frame.remove(), 60000);
      };
      if (img.complete) go();
      else img.onload = go;
    } catch {
      toast.error(L("Impression impossible sur cet appareil. Téléchargez le QR Code puis imprimez l'image.", "Printing is not possible on this device. Download the QR Code, then print the image.", "Haiwezekani kuchapisha kwenye kifaa hiki. Pakua QR Code kisha uchapishe picha."));
    }
  }

  async function run(id: string, accept: boolean, override = false) {
    setBusy(true);
    try {
      await decide({ data: { requestId: id, accept, override } });
      toast.success(accept ? L("Membre accepté", "Member accepted", "Mwanachama amekubaliwa") : L("Demande refusée", "Request declined", "Ombi limekataliwa"));
      setConfirm(null);
      await qc.invalidateQueries();
    } catch (e) {
      toast.error(translateError(e, ["Action impossible.", "Action failed.", "Imeshindwa."]));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 px-4">
      <SectionTitle title={L("INVITER DES MEMBRES", "INVITE MEMBERS", "ALIKA WANACHAMA")} />
      <div className="rounded-2xl bg-card p-4 ring-1 ring-line">
        <p className="break-all font-mono text-[11px] text-muted-foreground">{url}</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={shareLink} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-lagoon text-xs font-bold text-primary-foreground">
            <Link2 className="size-4" /> {L("Partager le lien", "Share link", "Shiriki kiungo")}
          </button>
          <button onClick={() => setQrOpen((v) => !v)} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-lagoon/10 text-xs font-bold text-lagoon">
            <QrCode className="size-4" /> {qrOpen ? L("Masquer le QR Code", "Hide QR Code", "Ficha QR Code") : L("Afficher le QR Code", "Show QR Code", "Onyesha QR Code")}
          </button>
        </div>
        {qrOpen && (
          <div className="mt-3">
            {preview ? (
              <img src={preview} alt={`${L("QR Code d'invitation", "Invitation QR Code", "QR Code ya mwaliko")} — ${groupName}`} className="w-full rounded-xl ring-1 ring-line" />
            ) : (
              <div className="aspect-[3/4] w-full animate-pulse rounded-xl bg-background" />
            )}
            <div className="mt-2 grid grid-cols-3 gap-2">
              <button disabled={!cardBlob} onClick={download} className="flex h-11 flex-col items-center justify-center rounded-xl bg-background text-[10px] font-semibold ring-1 ring-line">
                <Download className="size-4" /> {L("Télécharger le QR Code", "Download QR Code", "Pakua QR Code")}
              </button>
              <button disabled={!cardBlob} onClick={shareQr} className="flex h-11 flex-col items-center justify-center rounded-xl bg-background text-[10px] font-semibold ring-1 ring-line">
                <Share2 className="size-4" /> {L("Partager", "Share", "Shiriki")}
              </button>
              <button disabled={!cardBlob} onClick={print} className="flex h-11 flex-col items-center justify-center rounded-xl bg-background text-[10px] font-semibold ring-1 ring-line">
                <Printer className="size-4" /> {L("Imprimer", "Print", "Chapisha")}
              </button>
            </div>
          </div>
        )}
        <button
          onClick={async () => {
            if (!window.confirm(L("Créer un nouveau lien ? L'ancien lien et l'ancien QR Code ne fonctionneront plus.", "Create a new link? The old link and QR Code will stop working.", "Unda kiungo kipya? Kiungo na QR Code za zamani hazitafanya kazi tena."))) return;
            await rotate({ data: { groupId: tontineId } });
            setPreview(null);
            await qc.invalidateQueries({ queryKey: key });
            toast.success(L("Nouveau lien créé", "New link created", "Kiungo kipya kimeundwa"));
          }}
          className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-muted-foreground"
        >
          <RefreshCw className="size-3" /> {L("Renouveler le lien (désactive l'ancien)", "Renew link (disables the old one)", "Fanya upya kiungo (huzima cha zamani)")}
        </button>
      </div>

      <SectionTitle title={`${L("Demandes d'adhésion", "Join requests", "Maombi ya kujiunga")} (${data.requests.length})`} />
      <div className="divide-y divide-line rounded-2xl bg-card ring-1 ring-line">
        {data.requests.length === 0 && <p className="p-4 text-xs text-muted-foreground">{L("Aucune demande en attente.", "No pending requests.", "Hakuna maombi yanayosubiri.")}</p>}
        {data.requests.map((r) => (
          <div key={r.id} className="p-3">
            <div className="flex items-center gap-2">
              <UserPlus className="size-4 text-lagoon" />
              <div className="flex-1">
                <p className="text-sm font-semibold">{r.name || L("Sans nom", "No name", "Bila jina")}</p>
                <p className="font-mono text-[10px] text-muted-foreground">{r.phone}</p>
              </div>
              {r.hasDisputes && (
                <span className="flex items-center gap-1 rounded-full bg-bad/15 px-2 py-1 text-[9px] font-bold text-bad">
                  <AlertTriangle className="size-3" /> {L("Litiges", "Disputes", "Migogoro")}
                </span>
              )}
            </div>
            <div className="mt-2 flex gap-2">
              <button
                disabled={busy}
                onClick={() => (r.hasDisputes ? setConfirm({ id: r.id, name: r.name }) : run(r.id, true))}
                className="h-10 flex-1 rounded-xl bg-lagoon text-xs font-bold text-primary-foreground"
              >
                {L("Accepter", "Accept", "Kubali")}
              </button>
              <button
                disabled={busy}
                onClick={() => run(r.id, false)}
                className="h-10 flex-1 rounded-xl bg-background text-xs font-bold text-muted-foreground ring-1 ring-line"
              >
                {L("Refuser", "Decline", "Kataa")}
              </button>
            </div>
          </div>
        ))}
      </div>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.name || L("Demandeur", "Applicant", "Mwombaji")}</AlertDialogTitle>
            <AlertDialogDescription>
              {L("Cette personne a des litiges dans d’autres groupes. Voulez-vous toujours l’accepter dans ce groupe ?", "This person has disputes in other groups. Do you still want to accept them into this group?", "Mtu huyu ana migogoro katika vikundi vingine. Bado unataka kumkubali katika kikundi hiki?")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy} onClick={() => confirm && run(confirm.id, false)}>
              {L("REFUSER", "DECLINE", "KATAA")}
            </AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => confirm && run(confirm.id, true, true)}>
              {L("ACCEPTER QUAND MÊME", "ACCEPT ANYWAY", "KUBALI HATA HIVYO")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
