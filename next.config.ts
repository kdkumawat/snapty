import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  // Strict mode surfaces double-invoke bugs; build errors must fail CI instead
  // of shipping silently.
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
