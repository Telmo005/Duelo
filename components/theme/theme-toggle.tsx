"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

const STORAGE_KEY = "duelo-theme";

/** Segmented light/dark switch — reads the current theme from the <html>
 *  data-theme attribute (already set correctly on load by ThemeScript, so
 *  no flash/mismatch), writes the choice back to localStorage on toggle.
 *  Lives on /perfil, the natural home for a personal display preference. */
export function ThemeToggle() {
  // Starts "dark" to match the server-rendered markup (no data-theme
  // attribute = dark) — corrected from the DOM in an effect right after
  // mount, same pattern any client-only preference needs to avoid a
  // hydration mismatch warning.
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    setTheme(document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");
  }, []);

  function apply(next: "dark" | "light") {
    setTheme(next);
    if (next === "light") {
      document.documentElement.setAttribute("data-theme", "light");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private browsing / storage disabled — the toggle still works for
      // this page load, it just won't survive a refresh. Not worth an error.
    }
  }

  return (
    <div className="flex items-center gap-1 rounded-2xl border border-border bg-card p-1">
      {(
        [
          { key: "dark" as const, label: "Escuro", icon: Moon },
          { key: "light" as const, label: "Claro", icon: Sun },
        ]
      ).map((opt) => {
        const isActive = theme === opt.key;
        const Icon = opt.icon;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => apply(opt.key)}
            aria-pressed={isActive}
            className={`press flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-bold transition-colors ${
              isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
            }`}
          >
            <Icon className="size-4" aria-hidden />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
