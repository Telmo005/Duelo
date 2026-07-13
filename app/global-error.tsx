"use client";

/**
 * Same idea as error.tsx, but for errors thrown by the ROOT LAYOUT itself
 * (rare — layout.tsx has no data fetching of its own — but Next.js requires
 * this file to exist for that case, and it must render its own <html>/
 * <body> since it replaces the entire root layout when it triggers). Kept
 * intentionally plain/inline-styled: if the root layout itself is broken,
 * globals.css and the font may not be reliably available either.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="pt">
      <body style={{ margin: 0, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#14151D", color: "#E9EAF0", fontFamily: "sans-serif" }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 800 }}>Algo correu mal</h1>
          <p style={{ fontSize: 14, color: "#94989F", marginTop: 8 }}>Tenta novamente em instantes.</p>
          <button
            onClick={reset}
            style={{ marginTop: 20, padding: "12px 24px", borderRadius: 12, background: "#F2C22A", color: "#14150B", fontWeight: 800, border: "none", cursor: "pointer" }}
          >
            Tentar novamente
          </button>
        </div>
      </body>
    </html>
  );
}
