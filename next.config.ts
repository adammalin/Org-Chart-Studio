import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Import routes enforce their own stricter per-file and combined limits.
      // The framework gate must allow the complete multipart request to reach them.
      bodySizeLimit: "26mb",
    },
  },
};

export default nextConfig;
