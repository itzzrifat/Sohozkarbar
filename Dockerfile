FROM node:24-slim

# Install sqlite runtime dependencies if needed, curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package manifests and install production dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy application source
COPY . .

# Create volume mount point for persistent SQLite database
RUN mkdir -p /data

# Default environment variables
ENV PORT=3001
ENV DB_PATH=/data/sohozkarbar_master.db
ENV NODE_ENV=production

EXPOSE 3001

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

CMD ["node", "server.js"]
