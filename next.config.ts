/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["nonvibrating-ying-inhomogeneously.ngrok-free.dev"],
  experimental: {
    serverActions: {
      allowedOrigins: ["nonvibrating-ying-inhomogeneously.ngrok-free.dev", "localhost:3000"],
    },
  },
};

export default nextConfig;
