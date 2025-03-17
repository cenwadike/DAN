# Stage 1: Build
FROM node:23-alpine AS builder

WORKDIR /app

# Install build dependencies for bcrypt and TypeScript
RUN apk add --no-cache python3 py3-pip make g++ && \
    ln -sf python3 /usr/bin/python

# Copy package files and install ALL dependencies (including dev)
COPY package*.json ./
RUN npm ci && npm cache clean --force

# Copy source files
COPY server.ts ./
COPY tsconfig.json ./
COPY idl.json ./
COPY .env ./

# Compile TypeScript to JavaScript
RUN npx tsc

# Stage 2: Runtime
FROM node:23-alpine

WORKDIR /app

# Install tini for signal handling
RUN apk add --no-cache tini

# Copy compiled files, node_modules, and necessary assets from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/idl.json ./dist/
COPY --from=builder /app/.env ./

# Expose port
EXPOSE 3000

# Use tini as entrypoint and run with --no-deprecation
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "--no-deprecation", "dist/server.js"]
