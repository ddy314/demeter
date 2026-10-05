FROM node:22-bookworm-slim AS web
WORKDIR /build
COPY package.json package-lock.json tsconfig.json vite.config.ts ./
RUN npm ci
COPY apps/web apps/web
COPY examples examples
RUN npm run build

FROM python:3.12-slim-bookworm AS python-deps
COPY --from=ghcr.io/astral-sh/uv:0.9.5 /uv /usr/local/bin/uv
WORKDIR /app
ENV UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

FROM python:3.12-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --uid 10001 --create-home demeter
WORKDIR /app
COPY --from=python-deps /app/.venv /app/.venv
COPY --from=web /build/dist /app/dist
COPY engine engine
COPY examples examples
RUN mkdir -p /app/data/runs && chown -R demeter:demeter /app/data
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    PYTHONDONTWRITEBYTECODE=1 \
    DEMETER_RUN_DIR=/app/data/runs \
    OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1
WORKDIR /app/data
USER demeter
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health',timeout=4)"
CMD ["uvicorn", "engine.api:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--limit-concurrency", "32"]
