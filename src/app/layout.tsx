import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Caveat } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import UpdateToast from "@/components/update-toast";
import JsonLd from "@/components/json-ld";
import { SkipLink } from "@/components/skip-link";
import { Toaster } from "@/components/ui/toaster";
import GoogleAnalytics from "@/components/google-analytics";
import { EDITOR_ACCENT, EDITOR_ACCENT_DARK } from "@/config/brand";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// Caveat: the classic marker-style handwriting face. It is a variable font
// (400-700), so a real 600 weight renders as a readable medium marker instead
// of a synthesized bold - keeps the handwritten character without the scribble.
const caveat = Caveat({ variable: "--font-handwritten", subsets: ["latin"], weight: ["400", "600", "700"] });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://snapty.pages.dev";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#161514" },
  ],
};

export const metadata: Metadata = {
  title: {
    default: "Snapty",
    template: "%s | Snapty",
  },
  description:
    "Snapty is the fastest way to mark up a screenshot: arrows, numbered steps, callouts, blur and spotlight. Free, no account, nothing uploaded.",
  keywords: [
    "screenshot editor",
    "image annotation",
    "online editor",
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
    "desktop screenshot editor",
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
    title: "Snapty: Point at exactly what you mean.",
    description:
      "Snapty is the fastest way to mark up a screenshot: arrows, numbered steps, callouts, blur and spotlight. Free, no account, nothing uploaded.",
    type: "website",
    siteName: "Snapty",
    locale: "en_US",
    images: [
      {
        url: "/og-image.svg",
        width: 1200,
        height: 630,
        alt: "Snapty: Point at exactly what you mean.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Snapty: Point at exactly what you mean.",
    description:
      "Snapty is the fastest way to mark up a screenshot: arrows, numbered steps, callouts, blur and spotlight. Free, no account, nothing uploaded.",
    images: ["/og-image.svg"],
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
    <html
      lang="en"
      suppressHydrationWarning
      // The brand colour is the one knob; globals.css derives every tint.
      className="editor-accent"
      style={{
        '--editor-accent': EDITOR_ACCENT,
        '--editor-accent-dark': EDITOR_ACCENT_DARK || EDITOR_ACCENT,
      } as React.CSSProperties}
    >
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${caveat.variable} antialiased`}
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <SkipLink />
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
