FROM node:24-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d AS base

# Keep npm at the repository-tested major while pinning the registry artifact to
# its published Subresource Integrity digest. The base image's bundled npm
# currently contains a fixable undici advisory.
RUN set -eux; \
  node -e "fetch('https://registry.npmjs.org/npm/-/npm-11.18.0.tgz').then((response) => { if (!response.ok) throw new Error('npm download failed: ' + response.status); return response.arrayBuffer(); }).then((body) => require('node:fs').writeFileSync('/tmp/npm.tgz', Buffer.from(body)))"; \
  echo "4faecce0be70366d1c67b1012c4adc1246354a6cc45bf589f92003073b05518d547403df1475c542d67a4845e22b4fafcd7cac0af02c7a96cc6814f09eb003fb  /tmp/npm.tgz" | sha512sum -c -; \
  rm -rf /usr/local/lib/node_modules/npm; \
  mkdir -p /usr/local/lib/node_modules/npm; \
  tar -xzf /tmp/npm.tgz -C /usr/local/lib/node_modules/npm --strip-components=1; \
  rm -f /tmp/npm.tgz

FROM base AS deps

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS production-deps

WORKDIR /app
COPY package.json package-lock.json ./
COPY scripts/production-dependency-guard.mjs ./scripts/
RUN npm pkg delete devDependencies \
  && npm ci --omit=dev --omit=peer \
  && node ./scripts/production-dependency-guard.mjs --runtime-root /app \
  && npm cache clean --force

FROM deps AS builder

COPY . .
RUN DATABASE_PATH=/tmp/eastern-state-kpi-build.db npm run build \
  && rm -f /tmp/eastern-state-kpi-build.db* \
  && rm -rf /app/data

FROM base AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/package.json /app/package-lock.json /app/next.config.mjs /app/tsconfig.json ./
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/src ./src
COPY --from=production-deps /app/node_modules ./node_modules
RUN node ./scripts/production-dependency-guard.mjs --runtime-root /app

EXPOSE 3000
CMD ["npm", "run", "start:deploy"]
