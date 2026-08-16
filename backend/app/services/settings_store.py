"""设置存储：AppSetting 读写（敏感值 Fernet 加密）。"""

from sqlalchemy.orm import Session

from app.models.setting import AppSetting
from app.services.crypto import decrypt_value, encrypt_value


def get_setting(key: str, default: str = "") -> str:
    """读取设置（自动解密）。"""
    from app.core.deps import SessionLocal

    with SessionLocal() as db:
        row = db.query(AppSetting).filter(AppSetting.key == key).first()
        if row is None:
            return default
        return decrypt_value(row.value)


def set_setting(db: Session, key: str, plain_value: str) -> None:
    """写入设置（自动加密）。"""
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    if row is None:
        row = AppSetting(key=key, value=encrypt_value(plain_value))
        db.add(row)
    else:
        row.value = encrypt_value(plain_value)
    db.commit()


def get_llm_ready() -> bool:
    """LLM 是否已配置。"""
    from app.core.deps import SessionLocal

    from app.core.exceptions import DecryptError

    with SessionLocal() as db:
        row = db.query(AppSetting).filter(AppSetting.key == "llm.api_key").first()
    if row is None:
        return False
    try:
        return bool(decrypt_value(row.value))
    except DecryptError:
        return False
