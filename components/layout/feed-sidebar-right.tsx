import Link from "next/link";
import { LinkPendingSpinner } from "@/components/ui/link-pending-spinner";

const STEPS = [
  { n: 1, text: "Cria uma aposta ou aceita uma já aberta" },
  { n: 2, text: "O valor de ambos fica em custódia segura" },
  { n: 3, text: "O vencedor recebe automaticamente — pote menos 10%" },
];

export function FeedSidebarRight({ loggedIn = false }: { loggedIn?: boolean }) {
  return (
    <aside className="hidden lg:block">
      <div className="sticky top-[76px] flex flex-col gap-4">
        <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">Como funciona</p>
          <ol className="flex flex-col gap-3">
            {STEPS.map((s) => (
              <li key={s.n} className="flex items-start gap-2.5 text-sm">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-10 text-xs font-bold text-primary">
                  {s.n}
                </span>
                <span className="text-muted-foreground">{s.text}</span>
              </li>
            ))}
          </ol>
        </div>

        {loggedIn ? (
          <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
            <p className="mb-2 text-sm font-bold">Pronto para o próximo duelo?</p>
            <p className="mb-3 text-sm leading-relaxed text-muted-foreground">
              Cria uma aposta nova em segundos.
            </p>
            <Link
              href="/bets/new"
              className="press flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-90"
            >
              Criar aposta
              <LinkPendingSpinner />
            </Link>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
            <p className="mb-2 text-sm font-bold">Ainda não tens conta?</p>
            <p className="mb-3 text-sm leading-relaxed text-muted-foreground">
              Regista-te em segundos e deposita via M-Pesa ou e-Mola.
            </p>
            <Link
              href="/register"
              className="press flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-90"
            >
              Criar conta grátis
              <LinkPendingSpinner />
            </Link>
          </div>
        )}

        <p className="px-2 text-xs leading-relaxed text-muted-foreground">
          Duelo — apostas P2P entre pessoas reais. Disponível em Moçambique.
        </p>
      </div>
    </aside>
  );
}
