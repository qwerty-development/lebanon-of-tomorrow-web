import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Using App Router i18n via segment `[locale]`, not the legacy i18n config.

  // A lockfile in the parent directory made Turbopack infer the workspace root
  // one level up, which broke file watching (edits served stale in dev).
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
