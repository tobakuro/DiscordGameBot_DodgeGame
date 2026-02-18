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
  title: "Dodge Game",
  description: "3-player bullet dodge game",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#050816] text-white`}
      >
        <StarfieldBg />
        {children}
      </body>
    </html>
  );
}
