FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

COPY src ./src

# Build the TypeScript code
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy package config and install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled code from builder stage
COPY --from=builder /app/dist ./dist
 
EXPOSE 4000

CMD ["npm", "start"]
