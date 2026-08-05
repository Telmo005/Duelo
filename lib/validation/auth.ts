import { z } from "zod";

// Mozambique mobile number — this is only ever used as a login identifier
// (the synthetic-email trick in lib/actions/auth.ts), never to infer a
// mobile money wallet, so every real network prefix is accepted: Mcel
// (82/83), Vodacom/M-Pesa (84/85), Movitel/e-Mola (86/87). Which wallet
// someone actually pays with is chosen separately at deposit time.
const phoneRegex = /^\+258\s?8[2-7]\s?\d{3}\s?\d{4}$/;

export const displayNameSchema = z
  .string()
  .trim()
  .min(2, "Nome deve ter pelo menos 2 caracteres")
  .max(50, "Nome demasiado longo");

export const passwordSchema = z
  .string()
  .min(4, "Password deve ter pelo menos 4 caracteres")
  .max(72, "Password demasiado longa");

export const registerSchema = z.object({
  displayName: displayNameSchema,

  phone: z
    .string()
    .regex(phoneRegex, "Número inválido. Formato: +258 84 XXX XXXX"),

  password: passwordSchema,

  ageConfirmed: z
    .boolean()
    .refine((val) => val === true, {
      message: "Deves confirmar que tens 18 anos ou mais",
    }),

  // The 6-digit SMS code from requestPhoneVerification (lib/actions/
  // phoneVerification.ts) — registerUser verifies it against phone_otps
  // before creating the Supabase Auth user, see verifyAndConsumeOtp.
  otpCode: z.string().regex(/^\d{6}$/, "Código deve ter 6 dígitos"),

  // Optional — an invalid/unknown code never blocks registration (see
  // registerUser), it just means no referrer gets linked.
  referralCode: z.string().trim().max(20).optional(),
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

export const changePasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As passwords não coincidem",
    path: ["confirmPassword"],
  });

export type RegisterInput = z.infer<typeof registerSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
