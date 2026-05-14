FROM node:18-alpine AS builder

WORKDIR /app

# Copy root and workspace files
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

# Install dependencies
RUN npm ci --workspaces

# Copy source code
COPY backend/src ./backend/src
COPY backend/tsconfig.json ./backend/

# Build backend
RUN npm run build --workspace=backend

# Production image
FROM node:18-alpine

WORKDIR /app

# Install only production dependencies
ENV NODE_ENV=production
COPY package*.json ./
COPY backend/package*.json ./backend/

RUN npm ci --omit=dev --workspaces

# Copy compiled backend from builder
COPY --from=builder /app/backend/dist ./backend/dist

# Expose port
EXPOSE 5000

# Start backend
CMD ["node", "backend/dist/index.js"]
