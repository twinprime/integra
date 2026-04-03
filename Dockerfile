# Stage 1: build
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci

COPY . .
RUN npm run build

# Stage 2: serve with nginx (non-root)
FROM nginx:alpine

RUN apk add --no-cache git

# Remove default nginx static content
RUN rm -rf /usr/share/nginx/html/*

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# SPA routing: serve index.html for all routes
COPY nginx.conf /etc/nginx/nginx.conf

# Allow the nginx user to write the pid file and cache dirs at runtime
RUN mkdir -p /var/cache/nginx /tmp/nginx \
    && chown -R nginx:nginx \
        /var/cache/nginx \
        /tmp/nginx \
        /var/run \
        /usr/share/nginx/html \
        /etc/nginx/conf.d

USER nginx

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
