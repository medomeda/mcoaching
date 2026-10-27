import { z } from "zod";

export const PASSWORD_MIN_LENGTH = 10;

export const zPassword = z
  .string()
  .min(PASSWORD_MIN_LENGTH, "Le mot de passe doit contenir au moins 10 caractères.")
  .max(128, "Le mot de passe est trop long.")
  .regex(/[A-Za-zÀ-ÿ]/, "Le mot de passe doit contenir au moins une lettre.")
  .regex(/\d/, "Le mot de passe doit contenir au moins un chiffre.");
