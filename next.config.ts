import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";

initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Cloudflare Pages compatible - do NOT use output: "export" (API routes exist)
  // Deploy via: npx @opennextjs/cloudflare or connect repo to Cloudflare Pages
};

export default nextConfig;
