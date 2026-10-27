/**
 * Envoi d'e-mails transactionnels (PRD §9.11).
 * - EMAIL_PROVIDER vide (développement) : le message est écrit dans la console du serveur.
 * - EMAIL_PROVIDER=smtp : envoi via SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASSWORD, expéditeur EMAIL_FROM.
 * Le résultat n'est jamais une exception : l'appelant journalise et décide d'une nouvelle tentative.
 */
import nodemailer, { type Transporter } from "nodemailer";

export interface OutgoingEmail {
  to: string;
  subject: string;
  body: string;
  link?: string | null;
}

export type DeliveryResult = { ok: true } | { ok: false; code: string };

let transport: Transporter | null = null;

function smtp(): Transporter {
  if (transport) return transport;
  const port = Number(process.env.SMTP_PORT || 587);
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return transport;
}

/** Code d'erreur stable et non confidentiel (ex. SMTP_550, ECONNREFUSED). */
function errorCode(e: unknown): string {
  const err = e as { responseCode?: number; code?: string };
  if (err.responseCode) return `SMTP_${err.responseCode}`;
  return err.code || "SEND_FAILED";
}

export async function sendEmail(mail: OutgoingEmail): Promise<DeliveryResult> {
  const text = `${mail.body}${mail.link ? `\n\n${mail.link}` : ""}`;
  const provider = process.env.EMAIL_PROVIDER ?? "";
  if (!provider) {
    console.info(`[e-mail simulé] À : ${mail.to}\nObjet : ${mail.subject}\n${mail.body}${mail.link ? `\nLien : ${mail.link}` : ""}`);
    return { ok: true };
  }
  if (provider !== "smtp") return { ok: false, code: "PROVIDER_NOT_SUPPORTED" };
  try {
    await smtp().sendMail({ from: process.env.EMAIL_FROM, to: mail.to, subject: mail.subject, text });
    return { ok: true };
  } catch (e) {
    return { ok: false, code: errorCode(e) };
  }
}
