import type { Group, Transaction, TxStatus } from "./types";
import { memberOf } from "./engine";
import { currentLang, LOCALES, pick } from "@/lib/i18n";

const tr = (fr: string, en: string, sw: string) => pick(currentLang(), { fr, en, sw });
const loc = () => LOCALES[currentLang()];
import zukaLogo from "@/assets/zuka-logo.png";

export interface ReceiptData {
  id: string;
  reference: string;
  providerReference?: string;
  createdAt: string;
  amount: number;
  currency: string;
  status: TxStatus;
  statusLabel: string;
  kind: string;
  method: string;
  payerName: string;
  payerPhone: string;
  beneficiaryName: string;
  beneficiaryPhone: string;
  groupName: string;
  groupId: string;
  frequency: string;
  dueLabel: string;
  contributionAmount: number;
  penaltyAmount: number;
  dueDate?: string | undefined;
  daysLate: number;
}

const STATUS_FR = (): Record<TxStatus, string> => ({
  SUCCESS: tr("Réussie", "Successful", "Imefanikiwa"),
  PENDING: tr("En attente", "Pending", "Inasubiri"),
  PROCESSING: tr("En cours", "Processing", "Inaendelea"),
  FAILED: tr("Échouée", "Failed", "Imeshindwa"),
  CANCELLED: tr("Annulée", "Cancelled", "Imeghairiwa"),
  EXPIRED: tr("Expirée", "Expired", "Imeisha muda"),
});

const FREQ_FR = (): Record<string, string> => ({
  daily: tr("Journalière", "Daily", "Kila siku"),
  weekly: tr("Hebdomadaire", "Weekly", "Kila wiki"),
  monthly: tr("Mensuelle", "Monthly", "Kila mwezi"),
});

/** Builds a receipt strictly from the stored transaction — never invents a status. */
export function buildReceipt(group: Group, tx: Transaction): ReceiptData {
  const due = group.dues.find((d) => d.id === tx.dueId);
  const payer = memberOf(group, tx.memberId);
  const beneficiary = due ? memberOf(group, due.beneficiaryId) : undefined;
  const providerRef = (tx as Transaction & { providerReference?: string }).providerReference;

  return {
    id: tx.id,
    reference: tx.ref,
    ...(providerRef ? { providerReference: providerRef } : {}),
    createdAt: tx.createdAt,
    amount: tx.amount,
    currency: tx.currency,
    status: tx.status,
    statusLabel: STATUS_FR()[tx.status] ?? tx.status,
    kind: tr("Cotisation de tontine", "Tontine contribution", "Mchango wa tontine"),
    method: "Mobile Money",
    payerName: payer?.name ?? "—",
    payerPhone: payer?.phone ?? tx.msisdn ?? "—",
    beneficiaryName: beneficiary?.name ?? "—",
    beneficiaryPhone: beneficiary?.phone ?? "—",
    groupName: group.name,
    groupId: group.id,
    frequency: FREQ_FR()[group.frequency] ?? group.frequency,
    dueLabel: due
      ? `${tr("Échéance n°", "Due date no. ", "Awamu na. ")}${due.index} — ${new Date(`${due.date}T00:00:00`).toLocaleDateString(loc())}`
      : "—",
    contributionAmount: tx.contributionAmount ?? tx.amount,
    penaltyAmount: tx.penaltyAmount ?? 0,
    ...(tx.dueDate || due?.date ? { dueDate: tx.dueDate ?? due?.date } : {}),
    daysLate: tx.daysLate ?? 0,
  };
}

const money = (n: number, c: string) => {
  const [int, dec] = Math.abs(n).toFixed(2).split(".");
  const grouped = (int ?? "0").replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const body = dec && dec !== "00" ? `${grouped}.${dec}` : grouped;
  return `${n < 0 ? "-" : ""}${body} ${c}`;
};

async function logoDataUrl(): Promise<string | null> {
  try {
    const res = await fetch(zukaLogo);
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

const STATUS_RGB: Record<TxStatus, [number, number, number]> = {
  SUCCESS: [16, 122, 92],
  PENDING: [176, 122, 16],
  PROCESSING: [176, 122, 16],
  FAILED: [176, 42, 42],
  CANCELLED: [110, 110, 110],
  EXPIRED: [110, 110, 110],
};

/** Renders a clean A4 receipt and returns it as a Blob. */
export async function renderReceiptPdf(r: ReceiptData): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 48;

  // Header band
  doc.setFillColor(11, 58, 52);
  doc.rect(0, 0, W, 104, "F");
  const logo = await logoDataUrl();
  if (logo) {
    try {
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(M - 8, 22, 124, 60, 8, 8, "F");
      doc.addImage(logo, "PNG", M, 28, 108, 48, undefined, "FAST");
    } catch {
      /* ignore unsupported image */
    }
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("ZUKA PAY", W - M, 48, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(tr("Reçu de transaction", "Transaction receipt", "Risiti ya muamala"), W - M, 66, { align: "right" });
  doc.text(`${tr("Émis le", "Issued on", "Imetolewa")} ${new Date().toLocaleString(loc())}`, W - M, 80, { align: "right" });

  // Status banner
  const [sr, sg, sb] = STATUS_RGB[r.status];
  doc.setFillColor(sr, sg, sb);
  doc.roundedRect(M, 130, W - M * 2, 58, 8, 8, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.text(tr("STATUT DE LA TRANSACTION", "TRANSACTION STATUS", "HALI YA MUAMALA"), M + 16, 152);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(r.statusLabel.toUpperCase(), M + 16, 174);
  doc.setFontSize(18);
  doc.text(money(r.amount, r.currency), W - M - 16, 168, { align: "right" });

  // Rows
  const rows: Array<[string, string]> = [
    [tr("Identifiant unique", "Unique ID", "Kitambulisho cha kipekee"), r.id],
    [tr("Référence ZUKA PAY", "ZUKA PAY reference", "Kumbukumbu ya ZUKA PAY"), r.reference],
    ...(r.providerReference
      ? ([[tr("Référence fournisseur", "Provider reference", "Kumbukumbu ya mtoa huduma"), r.providerReference]] as Array<[string, string]>)
      : []),
    [tr("Date et heure", "Date and time", "Tarehe na saa"), new Date(r.createdAt).toLocaleString(loc())],
    [tr("Type d'opération", "Operation type", "Aina ya muamala"), r.kind],
    [tr("Moyen de paiement", "Payment method", "Njia ya malipo"), r.method],
    ...(r.penaltyAmount > 0
      ? ([
          [tr("Cotisation", "Contribution", "Mchango"), money(r.contributionAmount, r.currency)],
          [tr("Pénalité de retard", "Late penalty", "Adhabu ya kuchelewa"), money(r.penaltyAmount, r.currency)],
          [tr("Total payé", "Total paid", "Jumla iliyolipwa"), money(r.amount, r.currency)],
          [tr("Date prévue", "Due date", "Tarehe iliyopangwa"), r.dueDate ? new Date(`${r.dueDate}T00:00:00`).toLocaleDateString(loc()) : "—"],
          [tr("Jours de retard", "Days late", "Siku za kuchelewa"), String(r.daysLate)],
        ] as Array<[string, string]>)
      : ([[tr("Montant", "Amount", "Kiasi"), money(r.amount, r.currency)]] as Array<[string, string]>)),
    [tr("Devise", "Currency", "Sarafu"), r.currency],
    [tr("Expéditeur", "Sender", "Mtumaji"), r.payerName],
    [tr("Numéro de l'expéditeur", "Sender number", "Namba ya mtumaji"), r.payerPhone],
    [tr("Bénéficiaire du tour", "Turn beneficiary", "Mnufaika wa zamu"), r.beneficiaryName],
    [tr("Numéro du bénéficiaire", "Beneficiary number", "Namba ya mnufaika"), r.beneficiaryPhone],
    [tr("Groupe / tontine", "Group / tontine", "Kikundi / tontine"), `${r.groupName} (${r.groupId})`],
    [tr("Fréquence", "Frequency", "Marudio"), r.frequency],
    [tr("Échéance concernée", "Related due date", "Awamu husika"), r.dueLabel],
  ];

  let y = 220;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(11, 58, 52);
  doc.text(tr("DÉTAILS DE LA TRANSACTION", "TRANSACTION DETAILS", "MAELEZO YA MUAMALA"), M, y);
  y += 16;

  rows.forEach(([label, value], i) => {
    if (i % 2 === 0) {
      doc.setFillColor(245, 248, 247);
      doc.rect(M, y - 12, W - M * 2, 24, "F");
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(96, 106, 104);
    doc.text(label, M + 10, y + 4);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(22, 32, 30);
    doc.text(String(value), W - M - 10, y + 4, { align: "right" });
    y += 24;
  });

  // Authenticity note
  y += 24;
  doc.setDrawColor(215, 224, 221);
  doc.line(M, y, W - M, y);
  y += 20;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(96, 106, 104);
  const notes = [
    `${tr("Document généré automatiquement par l'application ZUKA PAY. Identifiant unique :", "Document generated automatically by the ZUKA PAY app. Unique ID:", "Hati imetengenezwa na programu ya ZUKA PAY. Kitambulisho cha kipekee:")} ${r.id}.`,
    tr("Conservez cet identifiant pour retrouver l'opération dans ZUKA PAY.", "Keep this ID to find the operation in ZUKA PAY.", "Hifadhi kitambulisho hiki ili kupata muamala kwenye ZUKA PAY."),
    r.status === "SUCCESS"
      ? tr("Ce reçu atteste d'une transaction confirmée par l'opérateur Mobile Money.", "This receipt certifies a transaction confirmed by the Mobile Money operator.", "Risiti hii inathibitisha muamala uliothibitishwa na mtoa huduma wa Mobile Money.")
      : tr("Attention : cette transaction n'est pas confirmée. Ce document ne vaut pas preuve de paiement.", "Warning: this transaction is not confirmed. This document is not proof of payment.", "Tahadhari: muamala huu haujathibitishwa. Hati hii si uthibitisho wa malipo."),
    tr("ZUKA PAY n'est pas une banque et ne détient aucun fonds : les paiements transitent par Mobile Money.", "ZUKA PAY is not a bank and holds no funds: payments go through Mobile Money.", "ZUKA PAY si benki na haishikilii fedha: malipo hupitia Mobile Money."),
  ];
  notes.forEach((n) => {
    doc.text(doc.splitTextToSize(n, W - M * 2), M, y);
    y += 14;
  });

  doc.setFontSize(8);
  doc.text(tr("ZUKA PAY — Gestion de tontines et cotisations Mobile Money (RDC)", "ZUKA PAY — Tontine and Mobile Money contribution management (DRC)", "ZUKA PAY — Usimamizi wa tontine na michango ya Mobile Money (DRC)"), M, 800);
  doc.text(r.reference, W - M, 800, { align: "right" });

  return doc.output("blob");
}

export const receiptFileName = (r: ReceiptData) => `ZUKA-PAY-recu-${r.reference}.pdf`;

export async function downloadReceipt(r: ReceiptData) {
  const blob = await renderReceiptPdf(r);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = receiptFileName(r);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Native share when the device supports sharing files, otherwise a download. */
export async function shareReceipt(r: ReceiptData): Promise<"shared" | "downloaded"> {
  const blob = await renderReceiptPdf(r);
  const file = new File([blob], receiptFileName(r), { type: "application/pdf" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: `Reçu ZUKA PAY ${r.reference}` });
      return "shared";
    } catch {
      return "shared"; // user cancelled
    }
  }
  await downloadReceipt(r);
  return "downloaded";
}

export function canShareFiles() {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (!nav.share || !nav.canShare) return false;
  try {
    return nav.canShare({ files: [new File([new Blob()], "x.pdf", { type: "application/pdf" })] });
  } catch {
    return false;
  }
}

/** Prints through the device's native print dialog, A4 sized. */
export async function printReceipt(r: ReceiptData) {
  const blob = await renderReceiptPdf(r);
  const url = URL.createObjectURL(blob);
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.src = url;
  document.body.appendChild(frame);

  const cleanup = () => {
    setTimeout(() => {
      frame.remove();
      URL.revokeObjectURL(url);
    }, 60000);
  };

  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      cleanup();
    } catch {
      frame.remove();
      const w = window.open(url, "_blank");
      if (!w) window.location.href = url;
      cleanup();
    }
  };
}
