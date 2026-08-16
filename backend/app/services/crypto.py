"""加密工具：Fernet 派生密钥，用于 AppSetting 敏感值加密。"""

import base64
import hashlib
import logging

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings
from app.core.exceptions import DecryptError

logger = logging.getLogger("careerkit.crypto")

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
    """解密。

    空串/None 视为「无值」返回 ""；密文非空但解密失败（密钥变更/数据损坏）
    抛出 DecryptError，不再静默吞掉，以便调用方区分「无值」与「解密失败」。
    """
    if not cipher:
        return ""
    try:
        return _get_fernet().decrypt(cipher.encode("utf-8")).decode("utf-8")
    except InvalidToken as exc:
        logger.error("敏感数据解密失败（密钥可能已变更或数据损坏）")
        raise DecryptError() from exc
