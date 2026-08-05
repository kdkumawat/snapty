import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import UpdateToast from "@/components/update-toast";
import JsonLd from "@/components/json-ld";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://snapty.pages.dev";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export const metadata: Metadata = {
  title: {
    default: "Snapty - Free Browser Screenshot Editor | Capture, Annotate & Share",
    template: "%s | Snapty",
  },
  description:
    "The fastest, most beautiful browser-based screenshot editor. Professional annotations with arrows, shapes, blur, text, step numbers and more. No installation required. Privacy-first - all processing happens locally.",
  keywords: [
    "screenshot editor",
    "image annotation",
    "online editor",
    "browser editor",
    "free screenshot tool",
    "annotate screenshots",
    "arrow tool",
    "blur tool",
    "pixelate",
    "snapty",
    "screenshot annotation",
    "image editor online",
    "privacy first editor",
    "no signup editor",
    "open source screenshot tool",
  ],
  authors: [{ name: "Snapty" }],
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
  manifest: "/manifest.json",
  metadataBase: new URL(siteUrl),
  applicationName: "Snapty",
  appleWebApp: {
    capable: true,
    title: "Snapty",
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    title: "Snapty - Free Browser Screenshot Editor",
    description:
      "Professional screenshot annotations in seconds. No installation needed. Privacy-first, open source, works offline.",
    type: "website",
    siteName: "Snapty",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Snapty - Free Browser Screenshot Editor",
    description:
      "Professional screenshot annotations in seconds. No installation needed.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: siteUrl,
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
    "apple-mobile-web-app-title": "Snapty",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <JsonLd />
          {/* Single full-viewport shell — keeps PWA/editor from sharing height with sibling nodes */}
          <div data-snapty-root className="bg-background text-foreground">
            <div className="flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden">
              {children}
            </div>
            <UpdateToast />
            <Toaster />
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
