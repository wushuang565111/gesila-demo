FROM node:18-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine AS runtime
WORKDIR /app
RUN mkdir -p /data
COPY --from=build /app/package*.json ./
RUN npm ci --production && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/share-server.js ./
ENV DISABLE_TUNNEL=1
ENV PORT=3000
ENV DATA_DIR=/data
EXPOSE 3000
CMD ["node", "share-server.js"]
