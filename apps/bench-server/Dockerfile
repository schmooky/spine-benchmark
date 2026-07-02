# bench-server now depends on the @spine-benchmark/metrics-impact-formula
# workspace package (model.ts pulls the default cost models), so we must build
# that package before bench-server AND ship its dist at runtime (the node_modules
# entry is a symlink into packages/, which must resolve inside the final image).
FROM node:22-alpine AS build
WORKDIR /repo
ENV HUSKY=0
COPY package.json package-lock.json ./
COPY packages/metrics-impact-formula/package.json packages/metrics-impact-formula/
COPY apps/bench-server/package.json apps/bench-server/
RUN npm ci --include-workspace-root=false \
  --workspace @spine-benchmark/metrics-impact-formula \
  --workspace @spine-benchmark/bench-server
COPY packages/metrics-impact-formula packages/metrics-impact-formula
COPY apps/bench-server apps/bench-server
# build:bench-server builds metrics-impact-formula, then bench-server
RUN npm run build:bench-server

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /repo/node_modules ./node_modules
# node_modules/@spine-benchmark/metrics-impact-formula is a symlink into
# ../../packages/...; place the built package there so the symlink resolves.
COPY --from=build /repo/packages/metrics-impact-formula/package.json ./packages/metrics-impact-formula/package.json
COPY --from=build /repo/packages/metrics-impact-formula/dist ./packages/metrics-impact-formula/dist
COPY --from=build /repo/apps/bench-server/dist ./dist
COPY --from=build /repo/apps/bench-server/package.json ./
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8787/livez || exit 1
CMD ["node", "dist/server.js"]
