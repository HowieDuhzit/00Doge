# Multi-stage build for 007 Remix

# Stage 1: Build the Vite frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the frontend (this creates dist/ directory)
RUN npm run build

# Stage 2: Production image
FROM node:20-alpine AS production

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy compiled server code from builder stage
COPY --from=frontend-builder /app/server/dist ./server/dist

# Copy built frontend from builder stage
COPY --from=frontend-builder /app/dist ./dist

# Create a production server that serves both static files and Socket.IO
COPY server-production.js ./server-production.js

# ONCE persists application data from /storage and expects HTTP on port 80.
RUN mkdir -p /storage

# Expose port (will use PORT env var, default 80)
EXPOSE 80

# Set NODE_ENV to production
ENV NODE_ENV=production
ENV PORT=80
ENV STORAGE_PATH=/storage

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1/up || exit 1

# Start the production server
CMD ["node", "server-production.js"]
