import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Caveat } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import UpdateToast from "@/components/update-toast";
import JsonLd from "@/components/json-ld";
import { Toaster } from "@/components/ui/toaster";
import GoogleAnalytics from "@/components/google-analytics";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const caveat = Caveat({ variable: "--font-handwritten", subsets: ["latin"], weight: ["400", "600", "700"] });

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
    default: "Snapty",
    template: "%s | Snapty",
  },
  description:
    "Free browser screenshot editor. Capture, annotate, and share. Professional arrows, shapes, blur, text, and step numbers. Privacy-first: all processing stays on your device. Install as a PWA.",
  keywords: [
    "screenshot editor",
    "browser screenshot editor",
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
    "PWA screenshot editor",
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
    title: "Snapty: Free Browser Screenshot Editor",
    description:
      "Professional screenshot annotations in seconds. No installation needed. Privacy-first, open source, works offline. Install as a PWA.",
    type: "website",
    siteName: "Snapty",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Snapty: Free Browser Screenshot Editor",
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
        className={`${geistSans.variable} ${geistMono.variable} ${caveat.variable} antialiased`}
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <JsonLd />
          {/* Single full-viewport shell - keeps PWA/editor from sharing height with sibling nodes */}
          <div data-snapty-root className="bg-canvas text-foreground">
            <div className="relative flex-1 min-h-0 min-w-0 w-full h-full flex flex-col overflow-hidden">
              {children}
            </div>
          </div>
          <UpdateToast />
          <Toaster />
          <GoogleAnalytics />
        </ThemeProvider>
      </body>
    </html>
  );
}
