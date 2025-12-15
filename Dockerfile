FROM node:22.15.0-alpine

WORKDIR /usr/src/app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 8000

CMD ["npm", "start"]
