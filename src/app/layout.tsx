import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import StarfieldBg from "@/components/StarfieldBg";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DodgeInvader",
  description: "3人対戦 弾幕回避ゲーム",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#050816] text-white`}
      >
        <StarfieldBg />
        {children}
      </body>
    </html>
  );
}
