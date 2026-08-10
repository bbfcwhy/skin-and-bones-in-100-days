import type { NextConfig } from "next";

const repository = "skin-and-bones-in-100-days";
const isProduction = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath: isProduction ? `/${repository}` : "",
  assetPrefix: isProduction ? `/${repository}/` : "",
  env: {
    NEXT_PUBLIC_BASE_PATH: isProduction ? `/${repository}` : "",
  },
};

export default nextConfig;
