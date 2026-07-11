import { z } from "zod";

// Same phone shape as auth (+258 84/85/86/87 XXX XXXX), but the prefix must
// match the chosen method — M-Pesa is 84/85, e-Mola is 86/87. Catches the
// user picking "M-Pesa" then typing an e-Mola number (or vice-versa) before
// we ever call the gateway.
const phoneRegex = /^\+258\s?8[4-7]\s?\d{3}\s?\d{4}$/;
const MPESA_PREFIXES = ["84", "85"];
const EMOLA_PREFIXES = ["86", "87"];

export const depositSchema = z
  .object({
    method: z.enum(["mpesa", "emola"]),
    amountMt: z.coerce
      .number()
      .positive("O valor tem de ser positivo")
      .min(1, "O depósito mínimo é 1 MT")
      .max(1_000_000, "Valor demasiado alto"),
    phone: z.string().regex(phoneRegex, "Número inválido. Formato: +258 84 XXX XXXX"),
  })
  .refine(
    (data) => {
      const digits = data.phone.replace(/\D/g, "");
      const prefix = digits.slice(3, 5); // after "258"
      const allowed = data.method === "mpesa" ? MPESA_PREFIXES : EMOLA_PREFIXES;
      return allowed.includes(prefix);
    },
    {
      message: "O número não corresponde ao método escolhido (M-Pesa: 84/85, e-Mola: 86/87)",
      path: ["phone"],
    }
  );

export type DepositInput = z.infer<typeof depositSchema>;
