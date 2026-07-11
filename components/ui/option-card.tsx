import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A SELECTABLE option — the middle tier between "static info" and "action".
 * Used wherever the user picks one of several choices (deposit method, match,
 * prediction). The whole point is that it must never be mistaken for either a
 * label or a submit button, so every OptionCard carries a visible selection
 * indicator (an empty ring when unselected, a filled check when selected) —
 * that ring is what tells a non-technical user "these are things to choose".
 *
 * Renders a real <button> with aria-pressed so the selected state is exposed
 * to assistive tech. Layout of the inner content is up to the caller (row or
 * grid); the indicator floats in the top-right corner either way.
 */
export function OptionCard({
  selected,
  onSelect,
  className,
  children,
  ariaLabel,
  disabled,
}: {
  selected: boolean;
  onSelect: () => void;
  className?: string;
  children: React.ReactNode;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={ariaLabel}
      onClick={onSelect}
      disabled={disabled}
      className={cn(
        "press relative rounded-2xl border p-4 text-left outline-none transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-50",
        selected
          ? "border-primary bg-primary/10 ring-1 ring-primary/50"
          : "border-border bg-card hover:border-primary/40 hover:bg-accent",
        className
      )}
    >
      <span
        className={cn(
          "pointer-events-none absolute right-3 top-3 flex size-5 items-center justify-center rounded-full border-2 transition-colors",
          selected
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-transparent"
        )}
        aria-hidden
      >
        <Check
          strokeWidth={3}
          className={cn("size-3 transition-opacity", selected ? "opacity-100" : "opacity-0")}
        />
      </span>
      {children}
    </button>
  );
}
