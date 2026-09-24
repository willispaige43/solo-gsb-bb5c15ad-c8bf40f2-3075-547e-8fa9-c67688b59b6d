FROM node:20-alpine

WORKDIR /app

# 先复制依赖清单并安装，利用 Docker 层缓存
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 再复制应用代码
COPY server.js ./
COPY lib ./lib
COPY public ./public

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
