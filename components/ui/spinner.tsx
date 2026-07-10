/** Tiny loading spinner — pure CSS animation (Tailwind's `animate-spin`),
 *  no JS/animation-library cost. `border-current` means it always matches
 *  the parent's text colour, so it drops into any button without a colour prop. */
export function Spinner({ className = "size-4" }: { className?: string }) {
  return <span className={`inline-block shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`} aria-hidden />;
}
