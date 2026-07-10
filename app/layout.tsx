import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "@/app/globals.css";
import { Toaster } from "sonner";

const jakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-jakarta",
});

export const metadata: Metadata = {
  title: {
    default: "Duelo — Apostas P2P entre pessoas reais",
    template: "%s | Duelo",
  },
  description:
    "Explora apostas criadas por outros utilizadores e entra no duelo. O dinheiro fica em custódia e o vencedor recebe automaticamente após o resultado oficial.",
  keywords: ["apostas", "futebol", "P2P", "Moçambique", "M-Pesa", "e-Mola"],
  robots: { index: true, follow: true },
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
