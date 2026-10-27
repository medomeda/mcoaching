/**
 * Primitives cryptographiques (WebCrypto, disponible dans le navigateur et Node ≥ 20).
 * Mots de passe : PBKDF2-SHA256 salé. Jetons : aléatoires 256 bits, seul leur hash est stocké.
 */
const enc = new TextEncoder();
export const PBKDF2_ITERATIONS = 120_000;

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomToken(bytes = 32): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return toHex(b);
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

export async function sha256(value: string): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(value))));
}

export async function hashPassword(password: string, salt?: string, iterations = PBKDF2_ITERATIONS) {
  const s = salt ?? randomToken(16);
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: enc.encode(s), iterations },
    key,
    256,
  );
  return { hash: toBase64(new Uint8Array(bits)), salt: s, iterations };
}

/** Comparaison à temps constant. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export { normalizeEmail } from "@/modules/core/validation";
