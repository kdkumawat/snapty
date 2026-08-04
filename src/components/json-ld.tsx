export default function JsonLd() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://snapkit.pages.dev";
  const data = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "SnapKit",
    url: siteUrl,
    description:
      "Free browser-based screenshot editor with professional annotations. No installation required.",
    applicationCategory: "DesignApplication",
    operatingSystem: "Any",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    featureList: [
      "Arrow annotation",
      "Rectangle and shape tools",
      "Blur and pixelate regions",
      "Text annotation",
      "Step numbering",
      "Spotlight focus",
      "PNG, JPG, WEBP export",
      "Copy to clipboard",
      "Keyboard shortcuts",
      "Works offline",
      "Privacy-first - no data leaves browser",
    ],
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
