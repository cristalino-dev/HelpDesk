import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["nodemailer", "imapflow", "mailparser"],
  experimental: {
    serverActions: {
      allowedOrigins: ["helpdesk.cristalino.co.il:3000", "localhost:3000"]
    }
  }
};

export default nextConfig;
