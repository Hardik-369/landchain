import type { Metadata, Viewport } from "next";
import { AuthProvider } from "@/components/auth-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "LANDCHAIN — Fractional real estate, settled on-chain",
    template: "%s · LANDCHAIN",
  },
  description:
    "Invest in RERA-verified Indian real estate from ₹25,000. Every title, document hash and ownership unit is anchored on the Hedera registry.",
  keywords: [
    "fractional real estate",
    "Hedera",
    "real estate investment",
    "property tokenisation",
    "LANDCHAIN",
  ],
  openGraph: {
    title: "LANDCHAIN — Fractional real estate, settled on-chain",
    description:
      "Premium fractional ownership of verified Indian property, with every document hash anchored on Hedera.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#060b18",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-dvh bg-ink font-sans text-white antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
