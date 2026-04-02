FROM node:20-alpine AS builder

WORKDIR /app/frontend

ARG REACT_APP_SAVE_INTERVAL_MS=2000

ENV REACT_APP_SAVE_INTERVAL_MS=$REACT_APP_SAVE_INTERVAL_MS
ENV NODE_ENV=production

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/. ./
RUN npm run build

FROM nginx:1.27-alpine

COPY frontend/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/frontend/build /usr/share/nginx/html

EXPOSE 80
