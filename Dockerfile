# Parse MCP Server Dockerfile
# Multi-stage build for optimal image size

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files and source
COPY package*.json ./
COPY tsconfig.json ./
COPY src/ ./src/

# Install dependencies (skip prepare to avoid build before source is ready)
RUN npm ci --ignore-scripts

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S mcpuser && \
    adduser -S mcpuser -u 1001

# Copy package files
COPY package*.json ./

# Install production dependencies only (skip prepare script since we copy pre-built files)
RUN npm ci --omit=dev --ignore-scripts && \
    npm cache clean --force

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Set ownership
RUN chown -R mcpuser:mcpuser /app

# Switch to non-root user
USER mcpuser

# Environment variables (to be provided at runtime)
ENV PARSE_SERVER_URL=""
ENV PARSE_APP_ID=""
ENV PARSE_MASTER_KEY=""
ENV PARSE_JS_KEY=""
ENV PARSE_REST_KEY=""

# MCP Transport configuration (http is default)
ENV MCP_TRANSPORT="http"
ENV MCP_PORT="3000"
ENV MCP_HOST="0.0.0.0"

# Expose HTTP port (only used in HTTP mode)
EXPOSE 3000

# Run the MCP server
CMD ["node", "dist/index.js"]

# Labels
LABEL org.opencontainers.image.title="Parse MCP Server"
LABEL org.opencontainers.image.description="MCP Server for AI agents to interact with Parse Server instances - explore databases, query classes, troubleshoot, and safely modify data"
LABEL org.opencontainers.image.source="https://github.com/R3D347HR4Y/parse-mcp"
LABEL org.opencontainers.image.url="https://github.com/R3D347HR4Y/parse-mcp"
LABEL org.opencontainers.image.documentation="https://github.com/R3D347HR4Y/parse-mcp#readme"
LABEL org.opencontainers.image.vendor="Eliott Guillaumin"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.version="1.0.0"

