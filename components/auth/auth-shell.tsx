import Link from "next/link";

const PREVIEW_DUELS = [
  { a: "João M.", b: "Carlos P.", match: "Man United — Arsenal", stake: "MT 1.000", color: "#9C98F7" },
  { a: "Fátima A.", b: "Pedro S.", match: "Barcelona — Real Madrid", stake: "MT 2.000", color: "#8B7CFF" },
];

export function AuthShell({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-2">
      {/* ── Branding panel (desktop only) ─────────────────────── */}
      <div className="hidden flex-col justify-center gap-10 px-12 lg:flex xl:px-20">
        <Link href="/" className="text-2xl font-extrabold tracking-tight text-primary">
          Duelo
        </Link>

        <div className="max-w-md">
          <h2 className="mb-4 text-4xl font-extrabold leading-tight tracking-tight text-foreground xl:text-5xl">
            Explora apostas.<br />
            <span className="text-primary">Entra no duelo.</span>
          </h2>
          <p className="text-base leading-relaxed text-muted-foreground">
            Vê apostas criadas por outras pessoas em tempo real. O teu dinheiro fica em custódia segura até o jogo terminar — o vencedor recebe automaticamente.
          </p>
        </div>

        {/* Preview cards */}
        <div className="flex flex-col gap-3">
          {PREVIEW_DUELS.map((d) => (
            <div
              key={d.match}
              className="flex items-center justify-between rounded-xl border border-border bg-card px-5 py-4 shadow-[var(--shadow-card)]"
            >
              <div className="flex items-center gap-3">
                <div
                  className="flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                  style={{ background: d.color }}
                >
                  {d.a.charAt(0)}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{d.a} vs {d.b}</p>
                  <p className="text-sm font-bold">{d.match}</p>
                </div>
              </div>
              <p className="text-sm font-extrabold text-primary">{d.stake}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Form panel ─────────────────────────────────────────── */}
      <div className="flex items-center justify-center px-5 py-10 sm:px-8 lg:bg-card lg:px-12">
        <div className="w-full max-w-sm">
          {/* Mobile-only nav back to feed */}
          <div className="mb-7 flex items-center gap-3 lg:hidden">
            <Link href="/" className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
              <svg width="16" height="16" fill="none" viewBox="0 0 16 16">
                <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Feed
            </Link>
            <div className="h-4 w-px bg-border" />
            <span className="text-sm font-extrabold tracking-tight text-primary">Duelo</span>
          </div>

          <div className="mb-7">
            <p className="mb-1 text-xs font-bold uppercase tracking-wider text-primary">{eyebrow}</p>
            <h1 className="mb-1.5 text-[28px] font-extrabold tracking-tight text-foreground sm:text-3xl">{title}</h1>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] sm:p-7 lg:border-0 lg:p-0 lg:shadow-none">
            {children}
          </div>
        </div>
      </div>
    </main>
  );
}
