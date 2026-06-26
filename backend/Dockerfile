# ============================================================
# Stage 1: Install production-only dependencies
# ============================================================
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --ignore-scripts

# ============================================================
# Stage 2: Build (needs devDependencies for the prisma CLI/tsc)
# ============================================================
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --ignore-scripts
COPY . .
RUN npx prisma generate
RUN npm run build

# ============================================================
# Stage 3: Production runner
# ============================================================
FROM node:20-alpine AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 backend

COPY --from=deps /app/node_modules ./node_modules
# The generated Prisma client lives in node_modules/@prisma/client; the
# prod-only install above has the package skeleton but not the generated
# runtime, so layer it in from the builder stage.
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder /app/node_modules/.prisma        ./node_modules/.prisma
COPY --from=builder /app/dist ./dist
COPY package.json ./

USER backend

EXPOSE 4000
ENV NODE_ENV=production
ENV PORT=4000

CMD ["node", "dist/server.js"]
