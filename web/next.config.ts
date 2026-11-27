import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.68.60"],
  // Brokers became Customers, which also covers shippers booked directly.
  async redirects() {
    return [
      {
        source: "/org/:slug/brokers/:path*",
        destination: "/org/:slug/customers/:path*",
        permanent: true,
      },
      // Reports moved onto the dashboard, under the day's work.
      {
        source: "/org/:slug/reports",
        destination: "/org/:slug#reports",
        permanent: false,
      },
    ]
  },
  experimental: {
    serverActions: {
      // Rate cons go to a server action to be read: up to 20 MB, plus room
      // for the form's own overhead. The default is 1 MB.
      bodySizeLimit: "21mb",
    },
  },
}

export default nextConfig
