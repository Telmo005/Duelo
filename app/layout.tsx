import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "@/app/globals.css";
import { Toaster } from "sonner";
import { ThemeScript } from "@/components/theme/theme-script";

const jakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-jakarta",
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const SITE_TITLE = "Duelo — Apostas P2P entre pessoas reais";
const SITE_DESCRIPTION =
  "Explora apostas criadas por outros utilizadores e entra no duelo. O dinheiro fica em custódia e o vencedor recebe automaticamente após o resultado oficial.";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: SITE_TITLE,
    template: "%s | Duelo",
  },
  description: SITE_DESCRIPTION,
  keywords: ["apostas", "futebol", "P2P", "Moçambique", "M-Pesa", "e-Mola"],
  robots: { index: true, follow: true },
  // app/manifest.ts (file convention) auto-links the manifest itself —
  // no need to repeat its URL here.
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Duelo" },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    type: "website",
    locale: "pt_MZ",
    siteName: "Duelo",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#0B0C10",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt" className={jakartaSans.variable} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>
        {children}
        <Toaster
          position="top-center"
          toastOptions={{
            style: {
              background: "var(--card)",
              border: "1px solid var(--border)",
              color: "var(--foreground)",
              fontFamily: "var(--font-jakarta), sans-serif",
            },
          }}
        />
      </body>
    </html>
  );
}
