FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production
EXPOSE 3000
HEALTHCHECK CMD wget -qO- http://localhost:${PORT:-3000}/healthz || exit 1
CMD ["node", "src/server.js"]
