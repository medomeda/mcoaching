import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Serveur autonome : utilisé par l'image Docker (Dockerfile).
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
