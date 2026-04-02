FROM node:20-alpine

WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm ci --omit=dev

COPY backend ./

ENV NODE_ENV=production
ENV SOCKET_PORT=3001

EXPOSE 3001

CMD ["node", "server.js"]
