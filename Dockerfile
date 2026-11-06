FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

COPY package.json server.mjs catalog.mjs app.mjs index.html styles.css ./
COPY assets ./assets

EXPOSE 3000
CMD ["node", "server.mjs"]
