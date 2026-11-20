# ==========================================
# Stage 1: Build the Application
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json ./

# Install dependencies deterministically
RUN npm ci

# Copy source code
COPY . .

# Build the Vite application for production
RUN npm run build

# ==========================================
# Stage 2: Serve with Nginx (Production)
# ==========================================
FROM nginxinc/nginx-unprivileged:alpine-slim

# Copy custom Nginx configuration for SPA routing and security
COPY --chown=nginx:nginx nginx.conf /etc/nginx/conf.d/default.conf

# Copy build artifacts from the builder stage
COPY --chown=nginx:nginx --from=builder /app/dist /usr/share/nginx/html

# Expose the unprivileged Nginx port
EXPOSE 8080

# Health check to monitor container status
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --spider http://localhost:8080/ || exit 1

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]