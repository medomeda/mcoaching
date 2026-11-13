/**
 * Gabarits d'e-mails (PRD §9.11). Ils ne contiennent JAMAIS le texte des messages privés
 * ni les pièces jointes : ils invitent à se connecter à la plateforme.
 */
import { DEFAULT_BRAND_NAME } from "@/modules/core/branding";

export type TemplateKey = "ACCOUNT_ACTIVATION" | "PASSWORD_RESET" | "NOTIFICATION";

export interface RenderedEmail {
  subject: string;
  body: string;
  link: string | null;
}

export function renderEmail(key: string, p: Record<string, string>, brand: string = DEFAULT_BRAND_NAME): RenderedEmail {
  const hello = `Bonjour ${p.name ?? ""},`.trim();
  const signature = `\n\n— ${brand}`;
  switch (key as TemplateKey) {
    case "ACCOUNT_ACTIVATION":
      return {
        subject: `Activez votre compte ${brand}`,
        body: `${hello}\n\nUn compte a été créé pour vous sur la plateforme d’accompagnement individuel.\nCliquez sur le lien ci-dessous pour définir votre mot de passe. Ce lien est personnel, à usage unique et expire dans 72 heures.${signature}`,
        link: p.link ?? null,
      };
    case "PASSWORD_RESET":
      return {
        subject: "Réinitialisation de votre mot de passe",
        body: `${hello}\n\nUne demande de réinitialisation de mot de passe a été effectuée.\nSi vous n’en êtes pas à l’origine, ignorez cet e-mail. Le lien expire dans 1 heure.${signature}`,
        link: p.link ?? null,
      };
    case "NOTIFICATION":
      return {
        subject: p.title ?? "Nouvelle notification",
        body: `${hello}\n\n${p.summary ?? "Vous avez une nouvelle notification."}\n\nPour des raisons de confidentialité, le contenu n’est pas reproduit dans cet e-mail. Connectez-vous à la plateforme pour le consulter.${signature}`,
        link: p.link ?? null,
      };
    default:
      return { subject: "Notification", body: hello, link: p.link ?? null };
  }
}
