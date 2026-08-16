"""加密工具：Fernet 派生密钥，用于 AppSetting 敏感值加密。"""

import base64
import hashlib

from cryptography.fernet import Fernet

from app.config import settings

_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        key = base64.urlsafe_b64encode(
            hashlib.sha256(settings.careerkit_secret.encode("utf-8")).digest()
        )
        _fernet = Fernet(key)
    return _fernet


def encrypt_value(plain: str) -> str:
    if not plain:
        return ""
    return _get_fernet().encrypt(plain.encode("utf-8")).decode("utf-8")


def decrypt_value(cipher: str) -> str:
    if not cipher:
        return ""
    try:
        return _get_fernet().decrypt(cipher.encode("utf-8")).decode("utf-8")
    except Exception:
        return ""
