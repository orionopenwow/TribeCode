# TribeCode server for a cloud host (docs/CLOUD.md). Zero npm dependencies: plain Node plus git.
FROM node:22-alpine
RUN apk add --no-cache git
WORKDIR /app
COPY package.json ./
COPY app/package.json app/package.json
COPY server server
COPY app/ui app/ui
COPY templates templates
COPY docs/guide docs/guide
COPY scripts/mcp-stdio.js scripts/mcp-stdio.js
ENV TRIBE_CLOUD=1 TRIBE_DIR=/data TRIBE_HOST=0.0.0.0 NODE_ENV=production
RUN mkdir -p /data && git config --global user.name "TribeCode" && git config --global user.email "tribe@localhost"
EXPOSE 4747
CMD ["node", "server/index.js"]
