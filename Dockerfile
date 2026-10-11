FROM node:22.19-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server.mjs ./
COPY lib ./lib
COPY public ./public
COPY fixtures ./fixtures
USER node
EXPOSE 3000
CMD ["node", "server.mjs"]
