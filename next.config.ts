/** @type {import('next').NextConfig} */
const splitCsv = (value?: string) =>
  (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

// Auto-detect GitHub Codespaces origin so server actions work in dev tunnels
function getCodespaceOrigins(): string[] {
  const name = process.env.CODESPACE_NAME;
  const domain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
  if (!name || !domain) return [];
  return [3000, 3001].map((port) => `${name}-${port}.${domain}`);
}

const codespaceOrigins = getCodespaceOrigins();
const envDevOrigins = splitCsv(process.env.ALLOWED_DEV_ORIGINS);
const envServerActionsOrigins = splitCsv(process.env.SERVER_ACTIONS_ALLOWED_ORIGINS);

// In development, always allow localhost so VS Code Simple Browser / port forwarding works
const devLocalOrigins =
  process.env.NODE_ENV !== 'production'
    ? ['localhost:3000', 'localhost:3001', '127.0.0.1:3000']
    : [];

const allowedDevOrigins = [...new Set([...codespaceOrigins, ...envDevOrigins])];
const serverActionsAllowedOrigins = [
  ...new Set([...codespaceOrigins, ...devLocalOrigins, ...envServerActionsOrigins]),
];

const nextConfig = {
  // Standalone output: copies only required files so Docker image stays small
  output: 'standalone',
  ...(allowedDevOrigins.length > 0 ? { allowedDevOrigins } : {}),
  experimental: {
    ...(serverActionsAllowedOrigins.length > 0
      ? {
          serverActions: {
            allowedOrigins: serverActionsAllowedOrigins,
          },
        }
      : {}),
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()'
          },
        ],
      },
    ];
  },
};

export default nextConfig;
