# Deployment Guide

## Cloudflare Pages (Recommended)

Snapty is deployed to Cloudflare Pages with the OpenNext Cloudflare adapter.

### Prerequisites

- Cloudflare account
- GitHub repository with your code
- Node.js 20+

### Cloudflare Pages settings

In Cloudflare Pages, use these values:

- **Build command:** `npm run cf:build`
- **Build output directory:** `out`
- **Important:** the app is now built as a static Pages export, so Cloudflare Pages must publish the generated `out` directory.
- **Node.js version:** `20`
- **Environment variable:** `NODE_VERSION=20`

The project already includes the required Cloudflare config files and the adapter dependency.

### Deploy via GitHub integration

1. Push the repository to GitHub.
2. Open Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git.
3. Select the repository and use the settings above.
4. Click Deploy.

### Deploy via CLI

```bash
npm install
npm run cf:build
npx wrangler pages deploy .open-next/assets --project-name=Snapty
```

### Cloudflare Pages Headers

The `public/_headers` file configures caching:
- HTML pages: no cache (always fresh)
- Static assets (`_next/static/*`): immutable, 1 year cache
- Service worker: no cache

### Environment Variables

| Variable | Description | Default |
|---|---|---|
| `NODE_VERSION` | Node.js version for build | `20` |
| `NEXT_PUBLIC_SITE_URL` | Production URL for SEO/canonical | `https://snapty.pages.dev` |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Google Analytics 4 measurement ID (`G-…`) | _(unset = analytics off)_ |

---

## Vercel

Snapty is a standard Next.js app and deploys to Vercel with zero config:

1. Push your code to GitHub
2. Import project at [vercel.com/new](https://vercel.com/new)
3. Vercel auto-detects Next.js and configures the build
4. Deploy

### Vercel Considerations

- The service worker (`sw.js`) works out of the box
- Set `NEXT_PUBLIC_SITE_URL` to your Vercel domain
- Vercel handles caching headers automatically for `_next/static/*`

---

## Docker

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json bun.lockb* ./
RUN npm install -g bun && bun install
COPY . .
RUN bun run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone .
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

Build and run:

```bash
docker build -t Snapty .
docker run -p 3000:3000 Snapty
```

---

## Netlify

1. Install adapter: `npm install -D @opennextjs/cloudflare`
2. Use the [Netlify Next.js adapter](https://docs.netlify.com/frameworks/next-js/overview/)
3. Or deploy as static export (no API routes needed for core features)

---

## Self-Hosted (Bare Metal / VPS)

```bash
# Clone
 git clone <your-repo> && cd Snapty

# Install
bun install

# Build
bun run build

# Run (production)
bun start
```

The production server runs on port 3000. Use a reverse proxy (nginx, Caddy) for HTTPS.

### Caddy Example

```
snapty.example.com {
    reverse_proxy localhost:3000
}
```

### Nginx Example

```nginx
server {
    listen 443 ssl;
    server_name snapty.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## Performance Notes

- **Service Worker**: Uses network-first for navigation (always fresh) and cache-first for static assets
- **Static Assets**: `_next/static/*` files have content hashes and can be cached indefinitely
- **PWA**: Snapty can be installed as a standalone browser app via the manifest.json
- **No Database**: All processing is client-side, no database needed
- **Bundle Size**: Dynamic imports for Konva.js keep initial load fast
