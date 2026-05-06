import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingIncludes: {
    "**": ["./prisma/schema.prisma"],
  },
};

export default nextConfig;
