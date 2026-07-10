"use client";

import { useLinkStatus } from "next/link";
import { Spinner } from "@/components/ui/spinner";

/** Drop this as a child of any `next/link` `<Link>` to show a spinner while
 *  that specific navigation is in flight (`useLinkStatus` reads pending
 *  state from the nearest enclosing Link — Next.js's built-in mechanism for
 *  this, no extra JS cost). Matters most on slow mobile connections, where a
 *  route can take a moment to load and a click with no visible reaction
 *  reads as "did that even work?". */
export function LinkPendingSpinner({ className = "size-3.5" }: { className?: string }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <Spinner className={className} />;
}
