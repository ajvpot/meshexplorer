import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import { ConfigProvider } from "@/components/ConfigContext";
import { QueryProvider } from "@/components/QueryProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MeshExplorer",
  description: "A real-time map, chat client, and packet analysis tool for mesh networks using MeshCore and Meshtastic.",
  icons: {
    icon: { url: "/favicon.svg", type: "image/svg+xml" },
    apple: { url: "/favicon.svg", type: "image/svg+xml" }
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "oklch(92.2% 0 0)" }, // neutral-200
    { media: "(prefers-color-scheme: dark)", color: "oklch(26.9% 0 0)" }, //neutral-800
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        style={{ '--header-height': '64px' } as React.CSSProperties}
      >
        <div className="flex flex-col min-h-screen w-full">
          <QueryProvider>
            <ConfigProvider>
              <Header />
              <main className="flex-1 flex flex-col w-full bg-neutral-200 dark:bg-neutral-800">{children}</main>
            </ConfigProvider>
          </QueryProvider>
        </div>
      </body>
    </html>
  );
}
