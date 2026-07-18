FROM node:24-alpine

WORKDIR /app
COPY package.json server.js verify.js ./
COPY public ./public

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
