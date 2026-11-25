/** Aide de test : calcule le code TOTP courant à partir de l'adresse `otpauth://` renvoyée à l'activation. */
import { base32 } from "@better-auth/utils/base32";
import { createOTP } from "@better-auth/utils/otp";

export async function codeFromUri(uri: string): Promise<string> {
  const param = new URL(uri).searchParams.get("secret");
  if (!param) throw new Error("secret absent de l'adresse otpauth");
  const secret = new TextDecoder().decode(base32.decode(param));
  return createOTP(secret).totp();
}
