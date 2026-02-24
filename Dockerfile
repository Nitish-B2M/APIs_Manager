# ============================================
# Postman Documentation Generator - Server
# Express.js Backend Application
# ============================================

# Stage 1: Builder
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy TypeScript source code
COPY . .

# Compile TypeScript to JavaScript
RUN npm run build

# ============================================
# Stage 2: Production Runner
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs

# Copy package files
COPY --from=builder /app/package*.json ./

# Install production dependencies only
RUN npm ci --only=production && npm cache clean --force

# Copy compiled JavaScript from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/db/schema.sql ./src/db/schema.sql
COPY --from=builder /app/src/db/migration.sql ./src/db/migration.sql

# Set ownership
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose the application port
EXPOSE 4001

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:4001/ || exit 1

# Start the application
CMD ["node", "dist/index.js"]

# ============================================
# Alternative: Development Dockerfile
# Uncomment below for development with hot reload
# ============================================

# FROM node:20-alpine AS development

# WORKDIR /app

# ENV NODE_ENV=development

# COPY package*.json ./
# RUN npm ci

# COPY . .

# EXPOSE 4001

# CMD ["npm", "run", "dev"]

# ============================================
# Database Initialization (Optional)
# Run this container separately to initialize the database
# ============================================

# FROM node:20-alpine AS db-init

# WORKDIR /app

# COPY package*.json ./
# RUN npm ci

# COPY . .

# # Set environment variables
# ENV DATABASE_URL=postgresql://user:password@host:5432/db

# CMD ["npm", "run", "db:init"]
