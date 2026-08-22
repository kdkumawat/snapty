import { defineCloudflareConfig } from "@opennextjs/cloudflare";

const cloudflareConfig = defineCloudflareConfig();

const openNextConfig = {
  ...cloudflareConfig,
  buildCommand: "npm run build",
  buildOutputPath: ".",
};

export default openNextConfig;
