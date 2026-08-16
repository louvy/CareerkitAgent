"""全局异常定义与统一异常处理器。"""

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class HarnessError(Exception):
    """Harness 层拒绝错误：违反宪法、闭环状态机、工具白名单等。"""

    def __init__(self, message: str, code: str = "HARNESS_VIOLATION", status_code: int = 422):
        self.message = message
        self.code = code
        self.status_code = status_code
        super().__init__(message)


class ClosedLoopError(HarnessError):
    def __init__(self, message: str):
        super().__init__(message, code="CLOSED_LOOP_VIOLATION", status_code=409)


class ConstitutionError(HarnessError):
    def __init__(self, message: str):
        super().__init__(message, code="CONSTITUTION_VIOLATION", status_code=422)


class ToolGuardError(HarnessError):
    def __init__(self, message: str):
        super().__init__(message, code="TOOL_NOT_ALLOWED", status_code=403)


class NotFoundError(HarnessError):
    def __init__(self, message: str):
        super().__init__(message, code="NOT_FOUND", status_code=404)


class LLMNotConfiguredError(HarnessError):
    def __init__(self):
        super().__init__("LLM 供应商尚未配置，请在设置页完成配置", code="LLM_NOT_CONFIGURED", status_code=400)


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(HarnessError)
    async def harness_error_handler(_: Request, exc: HarnessError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.message, "code": exc.code})

    @app.exception_handler(Exception)
    async def unhandled_error_handler(_: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(
            status_code=500,
            content={"detail": f"服务器内部错误: {exc.__class__.__name__}", "code": "INTERNAL_ERROR"},
        )
