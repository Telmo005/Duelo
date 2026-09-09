import { z } from "zod";

// The payer's phone/name/email are NOT collected here — createDepositAction
// pulls them straight from the user's own `profiles` row (already collected
// and verified at signup) and sends them to PayGate itself. So a deposit is
// just a method + an amount from the user's point of view.
//
// 'visa_mastercard' is NOT offered yet, even though PayGate/Debito Pay
// supports it: it requires payer_email, and profiles.email is null for every
// phone+password signup (the only reachable flow today, see db/schema.ts) —
// offering it would 400 on the gateway's own payer_email validation for
// virtually every user. Add it back once there's an email-collection step.
const METHOD_MIN_MT: Record<"mpesa" | "emola" | "mkesh", number> = {
  // Deve bater com MIN_AMOUNT em payment-gateway/src/lib/debitopay.ts.
  mpesa: 10,
  mkesh: 10,
  emola: 50,
};

export const depositSchema = z
  .object({
    method: z.enum(["mpesa", "emola", "mkesh"]),
    amountMt: z.coerce
      .number()
      .positive("O valor tem de ser positivo")
      .max(1_000_000, "Valor demasiado alto"),
  })
  .superRefine((data, ctx) => {
    const min = METHOD_MIN_MT[data.method];
    if (data.amountMt < min) {
      ctx.addIssue({ code: "custom", path: ["amountMt"], message: `O depósito mínimo via ${data.method} é ${min} MT` });
    }
  });

export type DepositInput = z.infer<typeof depositSchema>;
