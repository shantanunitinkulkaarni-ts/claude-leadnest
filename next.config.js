/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: true
  },
  eslint: {
    ignoreDuringBuilds: true
  },
  experimental: {
    serverActions: {
      allowedOrigins: [
        'localhost:3000',
        'leadnest.in',
        'www.leadnest.in',
        'leadnest-629032564012.us-central1.run.app',
        '*.run.app'
      ]
    }
  },
  images: {
    domains: ['hinqahjhtgsmljrrozql.supabase.co']
  }
}

module.exports = nextConfig
