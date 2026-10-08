FROM node:22-alpine AS build
WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm install --no-audit --no-fund
COPY src ./src
COPY scripts ./scripts
COPY test ./test
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY capability.json ./capability.json
RUN mkdir -p /data && chown 65532:65532 /data
ENV HOST=0.0.0.0 \
    PORT=8080 \
    NODE_ENV=production \
    AIMARKET_PROVIDER_IDENTITY_FILE=/data/provider.key
USER 65532:65532
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/src/agent.js"]
