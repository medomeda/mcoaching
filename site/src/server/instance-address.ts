/** Adresse publique d'une instance à partir de son sous-domaine. */
export function instanceUrl(label: string | null, domain = process.env.INSTANCE_DOMAIN): string | null {
  return label && domain ? `https://${label}.${domain}` : null;
}
