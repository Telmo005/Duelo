"use client";

import { useRouter } from "next/navigation";

/**
 * A "back" affordance that actually goes back in browser history, instead
 * of a fixed Link to one hardcoded destination. In practice these pages are
 * always reached by clicking an in-app link from the page `fallbackHref`
 * points to, so router.back() lands exactly where the user came from — the
 * old fixed-Link version always jumped to the same page regardless of the
 * actual path taken, which read as "back does nothing" after a few clicks.
 * `fallbackHref` stays as the plain `href` so middle-click / no-JS still work.
 */
export function BackLink({
  fallbackHref,
  children,
  className,
}: {
  fallbackHref: string;
  children: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();

  return (
    <a
      href={fallbackHref}
      onClick={(e) => {
        e.preventDefault();
        router.back();
      }}
      className={className}
    >
      {children}
    </a>
  );
}
