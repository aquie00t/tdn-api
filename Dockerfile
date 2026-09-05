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
# The Prisma CLI and dotenv are runtime dependencies rather than dev ones
# precisely so this install carries them: Render runs `pnpm db:deploy` from
# this image as its pre-deploy command, which is the only place the migration
# can be ordered ahead of the traffic that needs it.
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
# The schema declares no datasource url - it comes from here, so the CLI cannot
# reach the database without this file. It reads DATABASE_URL from the
# environment; the .env file it also looks for is absent by design, and dotenv
# is quiet about that.
COPY --from=build /app/prisma.config.ts ./prisma.config.ts

# Proves at build time what the pre-deploy command needs at deploy time: that
# the CLI resolved, that its engines came along despite `--ignore-scripts`
# skipping Prisma's postinstall, and that the TypeScript config above loads and
# wires the datasource. `validate` parses the schema without connecting, so the
# url only has to be well-formed - the real one arrives from the environment.
RUN DATABASE_URL="postgresql://build:check@localhost:5432/check" pnpm prisma validate

# Run as non-root for security (node user ships with node:alpine)
USER node

EXPOSE 3000

CMD ["node", "dist/index.js"]