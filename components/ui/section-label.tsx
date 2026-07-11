import { cn } from "@/lib/utils";

/**
 * A non-interactive section/step heading (e.g. "1 · Método"). Deliberately
 * styled as quiet uppercase text so it never competes with a button — it's a
 * label, and should read as one. The optional numbered chip walks the user
 * through multi-step forms (deposit, create-bet).
 */
export function SectionLabel({
  step,
  children,
  htmlFor,
  className,
}: {
  step?: number;
  children: React.ReactNode;
  /** When set, renders as a <label> bound to a field; otherwise a <p>. */
  htmlFor?: string;
  className?: string;
}) {
  const content = (
    <>
      {step != null && (
        <span
          className="flex size-5 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary"
          aria-hidden
        >
          {step}
        </span>
      )}
      {children}
    </>
  );

  const classes = cn(
    "mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground",
    className
  );

  return htmlFor ? (
    <label htmlFor={htmlFor} className={classes}>
      {content}
    </label>
  ) : (
    <p className={classes}>{content}</p>
  );
}
