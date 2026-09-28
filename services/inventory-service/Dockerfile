FROM node:18-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src
ENV PORT=4003
EXPOSE 4003
CMD ["node", "src/index.js"]
