"""MinIO 对象存储服务：简历文件、导出文件、知识库原始文档。"""

import io
import logging
import uuid
from typing import BinaryIO

from minio import Minio
from minio.error import S3Error

from app.config import settings

logger = logging.getLogger("careerkit.storage")

_client: Minio | None = None


def get_client() -> Minio:
    global _client
    if _client is None:
        _client = Minio(
            settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_secure,
        )
        if not _client.bucket_exists(settings.minio_bucket):
            _client.make_bucket(settings.minio_bucket)
    return _client


def object_name(category: str, filename: str) -> str:
    """生成对象名：{category}/{uuid16}-{safe_filename}。"""
    safe = filename.replace("\\", "_").replace("/", "_").replace(" ", "_")
    return f"{category}/{uuid.uuid4().hex[:16]}-{safe}"


def upload_bytes(category: str, filename: str, data: bytes, content_type: str = "application/octet-stream") -> str:
    """上传字节流，返回对象名。"""
    name = object_name(category, filename)
    get_client().put_object(
        settings.minio_bucket, name, io.BytesIO(data), len(data), content_type=content_type
    )
    return name


def upload_fileobj(category: str, filename: str, fileobj: BinaryIO, length: int, content_type: str = "application/octet-stream") -> str:
    name = object_name(category, filename)
    get_client().put_object(settings.minio_bucket, name, fileobj, length, content_type=content_type)
    return name


def download_bytes(object_name_str: str) -> bytes | None:
    try:
        resp = get_client().get_object(settings.minio_bucket, object_name_str)
        return resp.read()
    except S3Error as exc:
        logger.warning("MinIO 读取失败 %s: %s", object_name_str, exc)
        return None
    finally:
        if "resp" in locals():
            resp.close()
            resp.release_conn()


def presigned_url(object_name_str: str, expires_seconds: int = 3600) -> str:
    """生成临时访问 URL（导出文件下载等）。"""
    return get_client().presigned_get_object(settings.minio_bucket, object_name_str, expires=expires_seconds)


def delete_object(object_name_str: str) -> None:
    try:
        get_client().remove_object(settings.minio_bucket, object_name_str)
    except S3Error as exc:
        logger.warning("MinIO 删除失败 %s: %s", object_name_str, exc)
