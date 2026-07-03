import type { Metadata, Viewport } from "next";
import { Yomogi, Yusei_Magic } from "next/font/google";
import "./globals.css";

// 日本語フォントはサブセット事前読み込み非対応のため preload: false 必須
const yuseiMagic = Yusei_Magic({
  weight: "400",
  subsets: ["latin"],
  preload: false,
  display: "swap",
  variable: "--font-yusei",
});

const yomogi = Yomogi({
  weight: "400",
  subsets: ["latin"],
  preload: false,
  display: "swap",
  variable: "--font-yomogi",
});

export const metadata: Metadata = {
  title: "家計ぼっと LIFF",
  description: "LINE 家計簿 bot をフォームで操作する LIFF アプリ",
  other: {
    "color-scheme": "dark",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1D2522",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={`${yuseiMagic.variable} ${yomogi.variable}`}>
      <body>{children}</body>
    </html>
  );
}
