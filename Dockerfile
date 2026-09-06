# syntax=docker/dockerfile:1

FROM node:24-alpine AS build
WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY index.html nitro.config.ts vite.config.ts tsconfig.json ./
COPY public ./public
COPY src ./src
RUN pnpm build

FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build --chown=node:node /app/.output ./.output

USER node
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
