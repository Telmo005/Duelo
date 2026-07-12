import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { SUPPORT_PHONE_DISPLAY, SUPPORT_WHATSAPP_URL } from "@/lib/support";

/**
 * Recovery is support-assisted for now: no SMS/email channel is wired up
 * (see lib/actions/admin-users.ts), so a real automated "enviar instruções"
 * flow would be a lie. An admin verifies identity by phone/WhatsApp and
 * resets the password directly from /admin/users.
 */
export default function ResetPasswordPage() {
  return (
    <AuthShell
      eyebrow="Recuperar acesso"
      title="Recuperar a password"
      subtitle={
        <>
          Lembraste-te? <Link href="/login" className="font-bold text-primary">Entrar</Link>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Ainda não temos recuperação automática por SMS. Contacta o nosso suporte — vamos confirmar a tua identidade e repor a password contigo.
        </p>

        <a
          href={SUPPORT_WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="press flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-[15px] font-extrabold text-primary-foreground shadow-[var(--shadow-elevated)] transition-colors hover:bg-primary-90"
        >
          💬 Falar no WhatsApp
        </a>

        <a
          href={`tel:${SUPPORT_PHONE_DISPLAY.replace(/\s+/g, "")}`}
          className="press flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border text-[15px] font-bold text-foreground transition-colors hover:bg-accent"
        >
          📞 {SUPPORT_PHONE_DISPLAY}
        </a>

        <p className="text-center text-xs leading-relaxed text-muted-foreground">
          Vais precisar de confirmar o teu nome e número de telemóvel para verificarmos a conta.
        </p>
      </div>
    </AuthShell>
  );
}
