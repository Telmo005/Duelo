import { z } from "zod";

// Mozambique phone number — M-Pesa (+258 84/85) and e-Mola (+258 86/87)
const phoneRegex = /^\+258\s?8[4-7]\s?\d{3}\s?\d{4}$/;

export const displayNameSchema = z
  .string()
  .trim()
  .min(2, "Nome deve ter pelo menos 2 caracteres")
  .max(50, "Nome demasiado longo");

export const registerSchema = z.object({
  displayName: displayNameSchema,

  phone: z
    .string()
    .regex(phoneRegex, "Número inválido. Formato: +258 84 XXX XXXX"),

  password: z
    .string()
    .min(4, "Password deve ter pelo menos 4 caracteres")
    .max(72, "Password demasiado longa"),

  ageConfirmed: z
    .boolean()
    .refine((val) => val === true, {
      message: "Deves confirmar que tens 18 anos ou mais",
    }),
});

export const signInSchema = z.object({
  phone: z
    .string()
    .regex(phoneRegex, "Número inválido. Formato: +258 84 XXX XXXX"),

  password: z
    .string()
    .min(1, "Introduz a tua password")
    .max(72, "Password demasiado longa"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
