FROM node:24-bookworm-slim AS deps

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS builder

COPY . .
RUN DATABASE_PATH=/tmp/eastern-state-kpi-build.db npm run build \
  && rm -f /tmp/eastern-state-kpi-build.db* \
  && rm -rf /app/data

FROM node:24-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app ./

EXPOSE 3000
CMD ["npm", "run", "start:deploy"]
