export default function JsonLd() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://snapty.pages.dev";
  const data = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Snapty",
    url: siteUrl,
    description:
      "Snapty is the fastest way to mark up a screenshot: arrows, numbered steps, callouts, blur and spotlight. Free, no account, nothing uploaded.",
    applicationCategory: "DesignApplication",
    operatingSystem: "Any",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    featureList: [
      "Arrow annotation",
      "Crop tool",
      "Rectangle and shape tools",
      "Blur and pixelate regions",
      "Text annotation",
      "Step numbering",
      "Spotlight focus",
      "PNG, JPG, WEBP export",
      "Copy to clipboard",
      "Keyboard shortcuts",
      "Works offline",
      "Nothing is uploaded. Your screenshots stay on your device",
    ],
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
