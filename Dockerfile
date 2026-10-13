FROM node:20-alpine AS ui
WORKDIR /ui
COPY dashboard/package.json .
RUN npm install
COPY dashboard .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY package.json .
RUN npm install --omit=dev
COPY src ./src
COPY --from=ui /ui/dist ./public
CMD ["node", "src/index.js"]