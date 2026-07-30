FROM node:18-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine AS runtime
WORKDIR /app
COPY --from=build /app/package*.json ./
RUN npm ci --production && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/share-server.js ./
ENV DISABLE_TUNNEL=1
ENV PORT=8080
EXPOSE 8080
CMD ["node", "share-server.js"]
