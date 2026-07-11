import { z } from "zod";

// The payer's phone number is NOT collected here anymore — PayGate/PaySuite's
// own checkout page asks for it (and createCharge never sent it). So a deposit
// is just a method + an amount; the number lives entirely on the gateway side.
export const depositSchema = z.object({
  method: z.enum(["mpesa", "emola"]),
  amountMt: z.coerce
    .number()
    .positive("O valor tem de ser positivo")
    .min(1, "O depósito mínimo é 1 MT")
    .max(1_000_000, "Valor demasiado alto"),
});

export type DepositInput = z.infer<typeof depositSchema>;
