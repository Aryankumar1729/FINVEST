import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

_logger = logging.getLogger(__name__)

from . import db
from .config import CORS_ORIGINS
from .routers import chat as chat_router
from .routers import goal as goal_router
from .routers import invest as invest_router
from .routers import journal as journal_router
from .routers import onboarding as onboarding_router
from .routers import portfolio as portfolio_router
from .routers import profile as profile_router
from .routers import tax as tax_router


@asynccontextmanager
async def lifespan(_app: FastAPI):
    db.open_pool()
    try:
        yield
    finally:
        db.close_pool()


app = FastAPI(title="AI Financial Operating System", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(invest_router.router, tags=["Investment"])
app.include_router(portfolio_router.router, tags=["Portfolio"])
app.include_router(journal_router.router, tags=["Journal"])
app.include_router(goal_router.router, tags=["Goal"])
app.include_router(chat_router.router, tags=["Chat"])
app.include_router(profile_router.router, tags=["Profile"])
app.include_router(tax_router.router, tags=["Tax"])
app.include_router(onboarding_router.router, tags=["Onboarding"])


@app.exception_handler(Exception)
async def global_exception_handler(_request: Request, exc: Exception):
    _logger.exception("Unhandled server error: %s", exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal Server Error", "error": str(exc)},
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


# TEMPORARY DEBUG ONLY — delete after pool investigation. Not part of the public API.
@app.get("/_debug/pool-stats")
def debug_pool_stats() -> dict:
    if db._pool is None:
        return {"error": "pool is not open"}
    return dict(db._pool.get_stats())
