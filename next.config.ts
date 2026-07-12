import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // deploy.sh builds into .next-staging while the OLD app keeps serving from
  // .next, then swaps the two during a seconds-long stop window. At runtime
  // (next start) the env var is unset, so the app serves from ".next".
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: ["nodemailer", "imapflow", "mailparser"],
  experimental: {
    serverActions: {
      allowedOrigins: ["helpdesk.cristalino.co.il:3000", "localhost:3000"]
    }
  }
};

export default nextConfig;
