# Next.js 16 frontend — multi-stage build on node:20-alpine.
# Produces a slim runtime that only ships the standalone server + static assets.

# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: dependencies (cached against package.json / package-lock.json only)
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps

# libc6-compat covers prebuilt native modules (sharp, etc.) that expect glibc symbols.
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
# Copy any file-protocol overrides referenced from package.json ("braces": "file:packages/braces").
COPY packages ./packages
RUN npm ci --no-audit --no-fund

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: build (needs full source + dev deps to run `next build`)
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
ARG NEXT_PUBLIC_USE_COOKIE_AUTH=true
ARG NEXT_PUBLIC_COMPANY_CODE=DEMO
ARG NEXT_PUBLIC_COMPANY_NAME=Centrix\ ERP
ARG NEXT_PUBLIC_REVERB_APP_KEY=
ARG NEXT_PUBLIC_REVERB_HOST=
ARG NEXT_PUBLIC_REVERB_PORT=443
ARG NEXT_PUBLIC_REVERB_SCHEME=https
ARG NEXT_PUBLIC_APP_URL=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_USE_COOKIE_AUTH=$NEXT_PUBLIC_USE_COOKIE_AUTH \
    NEXT_PUBLIC_COMPANY_CODE=$NEXT_PUBLIC_COMPANY_CODE \
    NEXT_PUBLIC_COMPANY_NAME=$NEXT_PUBLIC_COMPANY_NAME \
    NEXT_PUBLIC_REVERB_APP_KEY=$NEXT_PUBLIC_REVERB_APP_KEY \
    NEXT_PUBLIC_REVERB_HOST=$NEXT_PUBLIC_REVERB_HOST \
    NEXT_PUBLIC_REVERB_PORT=$NEXT_PUBLIC_REVERB_PORT \
    NEXT_PUBLIC_REVERB_SCHEME=$NEXT_PUBLIC_REVERB_SCHEME \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 3: runtime — only the standalone output, static assets, and public/.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Use the stock `node` user baked into the image instead of running as root.
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

# Runtime assets served by Node route handlers from process.cwd():
#   - print-agent/              → /api/print-agent/file/[name] + bootstrap installer
#   - print-agent-dotnet/       → /api/print-agent/dotnet-source (zipped on demand)
# Must sit next to server.js (which is /app from the standalone output).
COPY --from=builder --chown=node:node /app/print-agent ./print-agent
COPY --from=builder --chown=node:node /app/print-agent-dotnet ./print-agent-dotnet

USER node

EXPOSE 3000

# server.js is produced by `output: 'standalone'` and replaces `npm start`.
CMD ["node", "server.js"]
