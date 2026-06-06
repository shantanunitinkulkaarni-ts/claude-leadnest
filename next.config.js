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
        'localhost:3003',
        'leadnest.in',
        'www.leadnest.in',
        '*.awsapprunner.com',
        '*.run.app'
      ]
    }
  },
  images: {
    domains: ['hinqahjhtgsmljrrozql.supabase.co']
  }
}

module.exports = nextConfig
