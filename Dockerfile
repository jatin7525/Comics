FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY next.config.mjs next.shared.mjs tsconfig.json ./
COPY scripts/service.mjs ./scripts/service.mjs
COPY apps ./apps
COPY src ./src
COPY public ./public
ARG SERVICE=reader
RUN node scripts/service.mjs "$SERVICE" build
RUN mkdir /release && if [ "$SERVICE" = reader ]; then cp -a .next/standalone/. /release/ && mkdir -p /release/.next/static && cp -a .next/static/. /release/.next/static/; else cp -a apps/$SERVICE/.next/standalone/. /release/ && mkdir -p /release/apps/$SERVICE/.next/static && cp -a apps/$SERVICE/.next/static/. /release/apps/$SERVICE/.next/static/; fi
RUN if [ "$SERVICE" = reader ]; then cp -a public /release/public; else cp -a public /release/apps/$SERVICE/public; fi
RUN if [ "$SERVICE" = reader ]; then printf "require('./server.js')" > /release/entry.cjs; else printf "require('./apps/%s/server.js')" "$SERVICE" > /release/entry.cjs; fi

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /release ./
USER node
EXPOSE 3000
CMD ["node", "entry.cjs"]
