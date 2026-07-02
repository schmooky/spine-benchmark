FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/bench-server/package.json apps/bench-server/
RUN npm ci --workspace @spine-benchmark/bench-server --include-workspace-root=false
COPY apps/bench-server apps/bench-server
RUN npm run build --workspace @spine-benchmark/bench-server

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/apps/bench-server/dist ./dist
COPY --from=build /repo/apps/bench-server/package.json ./
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8787/livez || exit 1
CMD ["node", "dist/server.js"]
