# syntax=docker/dockerfile:1.7

FROM node:22.22.3-alpine3.22@sha256:cd7807368cf24826297cbad5dca1a44972ccfd770647db52a8c7589eb4599ac8 AS deps
WORKDIR /src
COPY package.json package-lock.json .npmrc ./
RUN npm ci

FROM deps AS source
COPY . .

FROM source AS app-build
ARG TYPR_DEPLOYMENT_CHANNEL=stable
ARG TYPR_BUILD_SHA
RUN test -n "$TYPR_BUILD_SHA" \
 && TYPR_DEPLOYMENT_CHANNEL="$TYPR_DEPLOYMENT_CHANNEL" TYPR_BUILD_SHA="$TYPR_BUILD_SHA" npm run build:self-hosted \
 && node scripts/generate-typr-runtime.mjs --output /tmp/typr-runtime

FROM nginxinc/nginx-unprivileged:1.30.4-alpine3.24@sha256:44e36330f74d4f3a1d4e222acca9e23b401fb87811a7597024502bb759c4dd49 AS runtime-base
USER root
COPY --from=app-build /src/dist/ /usr/share/nginx/html/
COPY --from=app-build /tmp/typr-runtime/ /etc/typr/
COPY docker/typr-nginx.conf /etc/nginx/nginx.conf
COPY docker/typr-security.conf /etc/nginx/snippets/typr-security.conf
COPY docker/typr-entrypoint.sh /usr/local/bin/typr-entrypoint
RUN chmod 0555 /usr/local/bin/typr-entrypoint
USER 101:101
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/typr-entrypoint"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/healthz"]

FROM runtime-base AS lite
COPY docker/typr-variant-lite /etc/typr/image-variant
ENV TYPR_IMAGE_VARIANT=lite \
    TYPR_COMPILER_ASSETS_MODE=r2

FROM deps AS asset-build
COPY compiler-assets.lock.json ./
COPY scripts/ensure-busytex-assets.cjs scripts/prepare-compiler-assets.mjs ./scripts/
COPY scripts/lib/compiler-assets.mjs scripts/lib/safe-generated-output.mjs ./scripts/lib/
RUN npm run busytex:assets \
 && node scripts/prepare-compiler-assets.mjs --stage /tmp/compiler-assets \
 && chmod -R a-w /tmp/compiler-assets

FROM runtime-base AS full
COPY --from=asset-build /tmp/compiler-assets/ /compiler-assets/
COPY docker/typr-variant-full /etc/typr/image-variant
ENV TYPR_IMAGE_VARIANT=full \
    TYPR_COMPILER_ASSETS_MODE=local
