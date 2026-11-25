import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Projet indépendant : sans cela Next prend la racine du dépôt (package-lock.json parent) et déplace server.js.
  outputFileTracingRoot: process.cwd(),
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
