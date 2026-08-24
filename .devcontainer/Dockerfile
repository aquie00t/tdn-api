# Node major must satisfy engines.node in package.json (.npmrc sets engine-strict)
FROM mcr.microsoft.com/devcontainers/javascript-node:1-26-bookworm

# corepack resolves pnpm from the packageManager field at runtime, inside the
# mounted workspace — pinning @latest here would drift from package.json
RUN corepack enable

RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get -y install --no-install-recommends python3 make g++ openssl

EXPOSE 3000