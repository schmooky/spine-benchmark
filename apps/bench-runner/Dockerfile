# Static build of the bench-runner (Vite SPA). Builds the two workspace packages
# it depends on (gpu-timing, metrics-impact-formula) BEFORE the app, then serves
# the static dist with nginx. Point the deploy at this Dockerfile.
#
# The install is SCOPED to just this app + its workspace deps
# (--workspace ... --include-workspace-root=false), so the sibling workspaces
# (bench-server, new-site, site, ...) don't need to be in the build context -
# same pattern the bench-server Dockerfile uses.
FROM node:22-alpine AS build
WORKDIR /repo
ENV HUSKY=0
# manifests first for a cache-friendly install
COPY package.json package-lock.json ./
COPY packages/gpu-timing/package.json packages/gpu-timing/
COPY packages/metrics-impact-formula/package.json packages/metrics-impact-formula/
COPY apps/bench-runner/package.json apps/bench-runner/
RUN npm ci --include-workspace-root=false \
  --workspace @spine-benchmark/gpu-timing \
  --workspace @spine-benchmark/metrics-impact-formula \
  --workspace @spine-benchmark/bench-runner
# sources
COPY packages/gpu-timing packages/gpu-timing
COPY packages/metrics-impact-formula packages/metrics-impact-formula
COPY apps/bench-runner apps/bench-runner
# build:bench-runner builds gpu-timing + metrics-impact-formula, then the app
# (see root package.json). Each package carries its own typescript/vite devdep.
RUN npm run build:bench-runner

FROM nginx:alpine
# SPA fallback so client routes resolve; real files (viewer.html, assets) are
# served directly. Listen on 80 - set the platform's app port to 80.
RUN printf 'server {\n  listen 80;\n  root /usr/share/nginx/html;\n  location / { try_files $uri $uri/ /index.html; }\n}\n' > /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/bench-runner/dist /usr/share/nginx/html
EXPOSE 80
