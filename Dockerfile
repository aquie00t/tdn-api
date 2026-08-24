FROM node:26-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# Keep in sync with the packageManager field in package.json — @latest here
# means the image can resolve the lockfile differently than CI does
RUN npm install -g pnpm@11.5.0

# Runtime-only native deps (OpenSSL for Prisma engine, CA certs for TLS)
RUN apk add --no-cache openssl ca-certificates

FROM base AS build
WORKDIR /app
# Native build tools needed only at compile time (argon2 fallback, node-gyp)
RUN apk add --no-cache python3 make g++

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY . .

RUN pnpm prisma generate
RUN pnpm build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma

# Run as non-root for security (node user ships with node:alpine)
USER node

EXPOSE 3000

CMD ["node", "dist/index.js"]