FROM node:24-bookworm-slim AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV DOCKER_BUILD=1
ARG NEXT_PUBLIC_SITE_URL=https://ayahclip.com
ARG NEXT_PUBLIC_ASR_MODEL_URL=/models/fastconformer_ar_ctc_q8.onnx
ARG DEPLOYMENT_VERSION=local
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_ASR_MODEL_URL=$NEXT_PUBLIC_ASR_MODEL_URL
ENV DEPLOYMENT_VERSION=$DEPLOYMENT_VERSION

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV AYAHCLIP_SELF_HOSTED=1

ARG YT_DLP_VERSION=2026.07.04
ARG ASR_MODEL_SHA256=7e7f9aaccbf0f7d12104ebfee9a99625195454a359821139a777f389ec928b50
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl ffmpeg python3 python3-pip \
  # yt-dlp's TikTok extractor requires browser impersonation via curl_cffi;
  # the zipapp binary runs under system python3 and picks this up from
  # site-packages (yt-dlp/yt-dlp#15418).
  && pip3 install --no-cache-dir --break-system-packages "curl_cffi>=0.10" \
  && curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/download/${YT_DLP_VERSION}/yt-dlp" -o /usr/local/bin/yt-dlp \
  && chmod 0755 /usr/local/bin/yt-dlp \
  && /usr/local/bin/yt-dlp --version \
  && curl -fsSL "https://github.com/abdullahabozaid/ayahclip/releases/download/asr-model-v1/fastconformer_ar_ctc_q8.onnx" -o /tmp/fastconformer_ar_ctc_q8.onnx \
  && echo "${ASR_MODEL_SHA256}  /tmp/fastconformer_ar_ctc_q8.onnx" | sha256sum -c - \
  && rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
RUN mkdir -p /app/public/models \
  && mv /tmp/fastconformer_ar_ctc_q8.onnx /app/public/models/fastconformer_ar_ctc_q8.onnx \
  && chown -R nextjs:nodejs /app/public/models
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

EXPOSE 3000
USER nextjs
CMD ["node", "server.js"]
