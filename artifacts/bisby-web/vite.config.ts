import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

const isBuild = process.env.npm_lifecycle_event === "build";
const rawPort = process.env.PORT ?? (isBuild ? "5173" : undefined);

if (!rawPort) {
  throw new Error(
    'PORT environment variable is required but was not provided.',
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH ?? (isBuild ? "/" : undefined);

if (!basePath) {
  throw new Error(
    'BASE_PATH environment variable is required but was not provided.',
  );
}

const developmentPlane = process.env.VITE_BISBY_DEV_PLANE ?? 'platform';
const developmentHosts = {
  platform: 'bisby.pro',
  design: 'design.bisby.pro',
  clientalpha: 'clientalpha.bisby.pro',
} as const;
const developmentHost =
  developmentHosts[developmentPlane as keyof typeof developmentHosts] ??
  developmentHosts.platform;
const developmentApiUrl =
  process.env.BISBY_DEV_API_URL ?? 'http://127.0.0.1:8080';

const developmentProxy = (
  requestHost: string,
  prefix?: string,
) => ({
  target: developmentApiUrl,
  changeOrigin: true,
  ...(prefix
    ? {
        rewrite: (requestPath: string) =>
          requestPath.replace(prefix, ''),
      }
    : {}),
  configure: (proxy: {
    on: (
      event: 'proxyReq',
      listener: (proxyRequest: {
        setHeader: (name: string, value: string) => void;
      }) => void,
    ) => void;
  }) => {
    proxy.on('proxyReq', (proxyRequest) => {
      proxyRequest.setHeader('host', requestHost);
      proxyRequest.setHeader('x-forwarded-host', requestHost);
    });
  },
});

export default defineConfig({
  // Keep the Vercel workspace-root build marker explicit for clean deployments.
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    proxy:
      process.env.NODE_ENV !== 'production'
        ? {
            '/__bisby-dev/design/api': developmentProxy(
              developmentHosts.design,
              '/__bisby-dev/design',
            ),
            '/__bisby-dev/clientalpha/api': developmentProxy(
              developmentHosts.clientalpha,
              '/__bisby-dev/clientalpha',
            ),
            '/api': developmentProxy(developmentHost),
          }
        : undefined,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
