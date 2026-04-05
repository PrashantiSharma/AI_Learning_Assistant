/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV === "development";

const nextConfig = {
  distDir: isDev ? ".next-dev" : ".next-build",
  experimental: {
    typedRoutes: false,
  },
};

export default nextConfig;
