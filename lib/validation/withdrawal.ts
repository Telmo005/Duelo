import { z } from "zod";

// Mozambique phone number — M-Pesa (+258 84/85) and e-Mola (+258 86/87).
const phoneRegex = /^\+258\s?8[4-7]\s?\d{3}\s?\d{4}$/;

// A higher floor than deposits (1 MT): every withdrawal is processed by
// hand on PaySuite's dashboard, so a very small request costs the admin
// real time for little reason. Easy to tune if that assumption changes.
export const WITHDRAWAL_MIN_MT = 5;

export const withdrawalSchema = z.object({
  method: z.enum(["mpesa", "emola"]),
  amountMt: z.coerce
    .number()
    .positive("O valor tem de ser positivo")
    .min(WITHDRAWAL_MIN_MT, `O levantamento mínimo é ${WITHDRAWAL_MIN_MT} MT`)
    .max(1_000_000, "Valor demasiado alto"),
  phone: z.string().regex(phoneRegex, "Número inválido. Formato: +258 84 XXX XXXX"),
  recipientName: z.string().trim().min(2, "Indica o nome de quem vai receber").max(100),
});

export type WithdrawalInput = z.infer<typeof withdrawalSchema>;
