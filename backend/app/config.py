import logging
from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger("careerkit.config")

# 默认占位密钥（仅限开发环境）
_DEFAULT_SECRET = "change-me-to-a-long-random-string-32bytes"


class Settings(BaseSettings):
    """运行时配置，全部来自环境变量（.env）。"""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # 运行环境：dev / prod。prod 下禁止使用默认占位密钥。
    environment: str = "dev"

    # 数据库
    database_url: str = "postgresql+psycopg://careerkit:careerkit@localhost:5432/careerkit"
    # 缓存
    redis_url: str = "redis://localhost:6379/0"
    # 对象存储
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "careerkit"
    minio_secret_key: str = "careerkit123"
    minio_bucket: str = "careerkit"
    minio_secure: bool = False

    # 安全：API Key 加密密钥（Fernet 派生）
    careerkit_secret: str = _DEFAULT_SECRET
    cors_origins: str = "http://localhost:3000"

    # LLM 默认值（设置页可覆盖）
    llm_default_base_url: str = "https://api.openai.com/v1"
    llm_default_model: str = "gpt-4o-mini"
    embedding_model: str = "text-embedding-3-small"
    embedding_dim: int = 1536

    # Agent 运行时
    quality_gate_threshold: float = 6.0
    memory_window_rounds: int = 10
    memory_summary_token_threshold: int = 4000
    trace_retention_days: int = 30

    @model_validator(mode="after")
    def _check_secrets(self) -> "Settings":
        if self.careerkit_secret == _DEFAULT_SECRET:
            if self.environment != "dev":
                raise ValueError(
                    "生产环境必须设置 careerkit_secret（Fernet 密钥），禁止使用默认占位密钥。"
                    "请在 .env 中设置强随机值。"
                )
            logger.warning(
                "careerkit_secret 使用默认占位密钥，仅限开发环境；生产环境请立即更换。"
            )
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
