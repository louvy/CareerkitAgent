FROM python:3.11-slim

WORKDIR /srv

RUN pip install --no-cache-dir uv -i https://pypi.tuna.tsinghua.edu.cn/simple

# 1) 先只复制依赖定义（这一层在源码变动时不会失效）
COPY pyproject.toml uv.lock ./

# 2) 用国内源装依赖；BuildKit 缓存挂载让重跑也不重下 wheel
ENV UV_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev

# 3) 最后才复制源码 —— 改业务代码只重建这一层（秒级），不触发依赖重装
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./

EXPOSE 8000

CMD ["uv", "run", "--no-sync", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
