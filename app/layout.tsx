import type { Metadata, Viewport } from "next";
import { Bebas_Neue, Share_Tech_Mono, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
});

const bebasNeue = Bebas_Neue({
  variable: "--font-bebas",
  subsets: ["latin"],
  weight: "400",
});

const shareTechMono = Share_Tech_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "The Survival Room – Controlled Session Protocol",
  description:
    "A controlled survival-based escape protocol combining psychological pressure, technical thinking, and strategic decision-making.",
  icons: {
    icon: "/favicon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#050505",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${bebasNeue.variable} ${shareTechMono.variable} antialiased`}
      >
        {/* Geometric background */}
        <div className="geo-bg" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}