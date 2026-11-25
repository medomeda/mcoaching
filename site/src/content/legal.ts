/** Informations légales lues dans l'environnement : jamais inventées, jamais « undefined ». */
export const TO_COMPLETE = "À compléter";

export interface LegalInfo {
  company: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
}

export function legalInfo(env: Record<string, string | undefined> = process.env): LegalInfo {
  const v = (k: string) => env[k]?.trim() || null;
  return { company: v("LEGAL_COMPANY_NAME"), address: v("LEGAL_ADDRESS"), email: v("LEGAL_EMAIL"), phone: v("LEGAL_PHONE") };
}

/** Valeur affichable : la valeur saisie ou « À compléter ». */
export const shown = (value: string | null): string => value ?? TO_COMPLETE;
