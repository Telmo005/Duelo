import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";

/**
 * The app's ONE button system for prominent actions. Everything that a user
 * presses to *commit* something (Depositar, Criar aposta, Entrar, Aceitar)
 * uses these classes — so a "button" always looks the same and never gets
 * confused with a static label or a selectable option (which have their own
 * primitives: OptionCard, InfoRow, SectionLabel).
 *
 * Exposed as `actionButtonVariants` (a class string) too, so <Link> CTAs can
 * share the exact look without being forced through a <button>.
 */
export const actionButtonVariants = cva(
  "press inline-flex items-center justify-center gap-2 rounded-2xl font-extrabold tracking-tight transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-foreground shadow-[var(--shadow-elevated)] hover:bg-primary-90 disabled:bg-secondary disabled:text-muted-foreground disabled:shadow-none",
        // Reserved for "aceitar" — the one action that turns a bet into
        // real money in play for the person tapping it. Gold stays the
        // brand/neutral commit colour (Depositar, Criar aposta); green is
        // specifically "yes, take this bet" so it reads as its own signal.
        success:
          "bg-success text-success-foreground shadow-[0_0_20px_rgba(52,211,153,0.35)] hover:bg-success-90 disabled:bg-secondary disabled:text-muted-foreground disabled:shadow-none",
        secondary:
          "border border-border bg-card text-foreground hover:bg-accent disabled:opacity-60",
        ghost: "text-muted-foreground hover:bg-accent hover:text-foreground",
        danger: "text-destructive hover:bg-destructive-10 disabled:opacity-60",
      },
      size: {
        lg: "px-6 py-4 text-base",
        md: "px-5 py-3 text-[15px]",
        sm: "px-4 py-2.5 text-sm",
      },
      block: { true: "w-full" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

type ActionButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof actionButtonVariants> & {
    /** Shows a spinner and disables the button. */
    loading?: boolean;
    /** Leading icon (usually a lucide icon). Hidden while loading. */
    icon?: React.ReactNode;
  };

export function ActionButton({
  variant,
  size,
  block,
  loading = false,
  icon,
  disabled,
  className,
  children,
  ...props
}: ActionButtonProps) {
  return (
    <button
      className={cn(actionButtonVariants({ variant, size, block }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}
