"use client";

import { useEffect, useState } from "react";
import { Toaster, type ToasterProps } from "sonner";

/**
 * Sonner defaults its OWN `theme` prop to "light" when it isn't passed
 * explicitly — completely independent of this app's dark/gold `data-theme`
 * attribute on <html>. That mismatch is what made toast DESCRIPTIONS
 * (never the title, which inherits `color: inherit`) render almost
 * invisible: sonner's light-theme CSS sets the description to a dark grey
 * (#3f3f3f) meant for a white toast background, while toastOptions.style
 * below paints the toast itself in this app's dark card colour — dark grey
 * text on a dark card. Reading the actual `data-theme` attribute (same one
 * theme-toggle.tsx writes) and passing it through fixes this at the root
 * instead of fighting sonner's internal stylesheet with ever-more-specific
 * overrides. A MutationObserver (not a one-time read) keeps it correct if
 * the user toggles theme on /perfil without a full page reload.
 */
export function ToasterWithTheme(props: ToasterProps) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const read = () => setTheme(document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  return <Toaster theme={theme} {...props} />;
}
