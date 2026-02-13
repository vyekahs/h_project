FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN npm prune --production

FROM node:20-alpine
RUN apk add --no-cache tzdata
WORKDIR /app
COPY --from=builder /app/build build/
COPY --from=builder /app/node_modules node_modules/
COPY package.json .
COPY database/ database/
COPY scripts/ scripts/
COPY server.js .
COPY start.sh .

RUN chmod +x start.sh

EXPOSE 3000
ENV NODE_ENV=production
CMD [ "./start.sh" ]
