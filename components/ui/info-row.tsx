import { cn } from "@/lib/utils";

/**
 * A STATIC line of information — label on the left, value on the right. The
 * third tier (alongside ActionButton and OptionCard). It intentionally has no
 * border-box, hover, or press affordance, so it can never be mistaken for a
 * button. Used for the bet slip breakdown, the pot line, and any read-only
 * key/value the user should read but not tap.
 */
export function InfoRow({
  label,
  value,
  emphasis = false,
  valueClassName,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  /** The final "total" row — bigger, higher-contrast value. */
  emphasis?: boolean;
  valueClassName?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3", emphasis ? "py-3.5" : "py-3", className)}>
      <span className={cn("text-sm", emphasis ? "font-bold text-foreground" : "text-muted-foreground")}>
        {label}
      </span>
      <span
        className={cn(
          "shrink-0 text-right tabular-nums",
          emphasis ? "text-lg font-extrabold" : "text-sm font-bold",
          valueClassName
        )}
      >
        {value}
      </span>
    </div>
  );
}
