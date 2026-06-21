# Next.js frontend — Alpine + Node (same pattern as pitchpredictionswebsite)
FROM alpine

RUN mkdir -p /usr/src
WORKDIR /usr/src

COPY package.json package-lock.json ./
RUN apk add --no-cache nodejs npm && npm ci

COPY . .

ARG NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
ARG NEXT_PUBLIC_USE_COOKIE_AUTH=false
ARG NEXT_PUBLIC_COMPANY_CODE=DEMO
ARG NEXT_PUBLIC_COMPANY_NAME=Centrix ERP
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_USE_COOKIE_AUTH=$NEXT_PUBLIC_USE_COOKIE_AUTH
ENV NEXT_PUBLIC_COMPANY_CODE=$NEXT_PUBLIC_COMPANY_CODE
ENV NEXT_PUBLIC_COMPANY_NAME=$NEXT_PUBLIC_COMPANY_NAME
ENV NODE_ENV=production

RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
