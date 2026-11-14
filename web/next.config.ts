import type { NextConfig } from 'next';

// The lab lives at tonyt908.com/livekitlab: static pages, exported at build
// time, plus a small Cloudflare Worker for the API (worker/index.ts).
// Locally, `pnpm dev` runs the pages with Next and the same Worker with
// Wrangler, and Next forwards /livekitlab/api to it.
const BASE_PATH = '/livekitlab';
const API_PORT = process.env.LAB_API_PORT ?? '8790';
const exporting = process.env.NODE_ENV === 'production';

const nextConfig: NextConfig = {
  basePath: BASE_PATH,
  trailingSlash: true,
  // A build while `pnpm dev` runs would overwrite the dev server's files, so
  // each keeps its own folder.
  distDir: exporting ? '.next' : '.next-dev',
  env: { NEXT_PUBLIC_BASE_PATH: BASE_PATH },
  ...(exporting
    ? { output: 'export' }
    : {
        async rewrites() {
          return [
            { source: '/api/:path*', destination: `http://127.0.0.1:${API_PORT}${BASE_PATH}/api/:path*` },
          ];
        },
        async redirects() {
          return [{ source: '/', destination: `${BASE_PATH}/`, basePath: false, permanent: false }];
        },
      }),
};

export default nextConfig;
