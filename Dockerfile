FROM node:22-alpine
WORKDIR /app
COPY . .
RUN corepack enable && pnpm install --no-frozen-lockfile
CMD ["pnpm", "start"]
