/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000', 'leadnest.vercel.app', 'leadnest.in']
    }
  },
  images: {
    domains: ['hinqahjhtgsmljrrozql.supabase.co']
  }
}

module.exports = nextConfig
