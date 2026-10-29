# Validation runner image. Stateless: needs only API_URL and RUNNER_TOKEN.
# Built from the repo root after `npm run build:runner`:
#   docker build -f server/validation-runner/Dockerfile -t ifcvo-runner .
# Meant for scale-to-zero hosts (Cloudflare Containers, a VM that sleeps when
# the queue is empty). Memory: ~4x the largest file (web-ifc holds the model).
FROM node:22-slim
WORKDIR /app
RUN npm init -y >/dev/null && npm install --omit=dev jsdom@29.0.2 >/dev/null
COPY dist-runner/ ./
USER node
CMD ["node", "runner.mjs"]
