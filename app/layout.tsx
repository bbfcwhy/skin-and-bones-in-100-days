import type { Metadata, Viewport } from "next";
import "./globals.css";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  metadataBase: new URL("https://bbfcwhy.github.io/"),
  title: "Skin & Bones in 100 Days",
  description: "100 天運動、飲食、體重與臨時調整追蹤器。",
  applicationName: "Skin & Bones 100",
  alternates: {
    canonical: "/skin-and-bones-in-100-days/",
  },
  manifest: `${basePath}/manifest.webmanifest`,
  appleWebApp: {
    capable: true,
    title: "Skin & Bones 100",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: `${basePath}/icon-192.png`,
    apple: `${basePath}/icon-192.png`,
  },
  openGraph: {
    title: "Skin & Bones in 100 Days",
    description: "記錄變化、看懂影響，再做一個可以持續的調整。",
    type: "website",
    locale: "zh_TW",
    url: "/skin-and-bones-in-100-days/",
    images: [{ url: `${basePath}/og-image.png`, width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Skin & Bones in 100 Days",
    description: "100 天運動、飲食、體重與臨時調整追蹤器。",
    images: [`${basePath}/og-image.png`],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#143d35",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
