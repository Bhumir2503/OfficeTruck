import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.68.60"],
  experimental: {
    serverActions: {
      // Rate cons go to a server action to be read: up to 20 MB, plus room
      // for the form's own overhead. The default is 1 MB.
      bodySizeLimit: "21mb",
    },
  },
}

export default nextConfig
