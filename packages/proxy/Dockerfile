# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace files
COPY package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/proxy/package.json packages/proxy/

# Install dependencies
RUN npm install --workspace=packages/shared --workspace=packages/proxy

# Copy source
COPY packages/shared/ packages/shared/
COPY packages/proxy/ packages/proxy/

# Build shared first, then proxy
RUN npm run build -w packages/shared
RUN npx prisma generate --schema=packages/proxy/src/prisma/schema.prisma
RUN npm run build -w packages/proxy

# Stage 2: Runtime
FROM node:20-alpine AS runtime

WORKDIR /app

# Copy only production deps + built artifacts
COPY --from=builder /app/package.json ./
COPY --from=builder /app/packages/shared/package.json packages/shared/
COPY --from=builder /app/packages/proxy/package.json packages/proxy/

RUN npm install --workspace=packages/shared --workspace=packages/proxy --omit=dev

COPY --from=builder /app/packages/shared/dist/ packages/shared/dist/
COPY --from=builder /app/packages/proxy/dist/ packages/proxy/dist/
COPY --from=builder /app/packages/proxy/src/prisma/schema.prisma packages/proxy/src/prisma/

# Generate Prisma client in runtime
RUN npx prisma generate --schema=packages/proxy/src/prisma/schema.prisma

ENV NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "packages/proxy/dist/index.js"]
