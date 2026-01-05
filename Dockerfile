# Stage 1: Build w2vgrep from source
FROM golang:1.23-alpine AS w2vgrep-builder

RUN apk add --no-cache git

WORKDIR /build
RUN git clone --depth 1 https://github.com/arunsupe/semantic-grep.git .

# Static build for Alpine compatibility
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o w2vgrep .

# Stage 2: Build Node.js application
FROM node:20-alpine AS node-builder

WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./
RUN npm ci --only=production

# Copy source and build
COPY tsconfig.json ./
COPY src ./src
RUN npm install && npm run build

# Stage 3: Runtime
FROM node:20-alpine

# Install runtime dependencies
RUN apk add --no-cache ripgrep curl

WORKDIR /app

# Copy w2vgrep binary
COPY --from=w2vgrep-builder /build/w2vgrep /usr/local/bin/w2vgrep
RUN chmod +x /usr/local/bin/w2vgrep

# Copy Node.js application
COPY --from=node-builder /app/dist ./dist
COPY --from=node-builder /app/node_modules ./node_modules
COPY --from=node-builder /app/package.json ./

# Create models directory and symlink for compatibility
RUN mkdir -p /app/models && \
    mkdir -p /root/.config && \
    ln -s /app/models /root/.config/semantic-grep

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Environment variables
ENV W2VGREP_PATH=/usr/local/bin/w2vgrep
ENV MODEL_DIR=/app/models
ENV DOWNLOAD_MODELS=english

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "dist/index.js"]
