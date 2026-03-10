/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@domus/shared"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "vawqdqkaguhdgfhdebqw.supabase.co"
      }
    ]
  }
};

export default nextConfig;
