import { z } from "zod";

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

// Which operator prefix each wallet actually runs on (see the same mapping's
// comment in lib/validation/auth.ts): Mcel/mKesh 82-83, Vodacom/M-Pesa 84-85,
// Movitel/e-Mola 86-87. The account's registered phone.phone is whichever
// operator the person signed up with — that's completely unrelated to which
// wallet they want to pay a given deposit from (someone can register with a
// Movitel number and still hold a separate M-Pesa line). Charging the
// registered number regardless of the chosen method used to be the deposit
// bug here: PayGate/Debito Pay would just reject a number that doesn't match
// the wallet, with a gateway-level error nobody could self-diagnose. So the
// payer's phone is now its own required field (mirrors how withdrawals
// already collect one — see lib/validation/withdrawal.ts), defaulted to the
// profile's number but always editable, and validated against the selected
// method's real prefix range up front instead of failing at the gateway.
const METHOD_PHONE_PREFIX: Record<"mpesa" | "emola" | "mkesh", RegExp> = {
  mpesa: /^\+258\s?8[45]\s?\d{3}\s?\d{4}$/,
  emola: /^\+258\s?8[67]\s?\d{3}\s?\d{4}$/,
  mkesh: /^\+258\s?8[23]\s?\d{3}\s?\d{4}$/,
};

const METHOD_PHONE_HINT: Record<"mpesa" | "emola" | "mkesh", string> = {
  mpesa: "84 ou 85",
  emola: "86 ou 87",
  mkesh: "82 ou 83",
};

export const depositSchema = z
  .object({
    method: z.enum(["mpesa", "emola", "mkesh"]),
    amountMt: z.coerce
      .number()
      .positive("O valor tem de ser positivo")
      .max(1_000_000, "Valor demasiado alto"),
    phone: z.string().min(1, "Indica o número que vai pagar"),
  })
  .superRefine((data, ctx) => {
    const min = METHOD_MIN_MT[data.method];
    if (data.amountMt < min) {
      ctx.addIssue({ code: "custom", path: ["amountMt"], message: `O depósito mínimo via ${data.method} é ${min} MT` });
    }
    if (!METHOD_PHONE_PREFIX[data.method].test(data.phone)) {
      ctx.addIssue({
        code: "custom",
        path: ["phone"],
        message: `Este número não é válido para ${data.method === "mpesa" ? "M-Pesa" : data.method === "emola" ? "e-Mola" : "mKesh"}. Usa um número ${METHOD_PHONE_HINT[data.method]}.`,
      });
    }
  });

export type DepositInput = z.infer<typeof depositSchema>;
