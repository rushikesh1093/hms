import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.core.config import settings
from app.core.database import engine
from app.core.exceptions import register_exception_handlers
from app.routers import audit_logs, auth, eye_checkups, followups, patients, reports, users

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("hms")


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Apply BOOTSTRAP_ADMIN_PASSWORD on start-up regardless of the host's start command.
    if settings.ENVIRONMENT != "test" and settings.BOOTSTRAP_ADMIN_PASSWORD:
        from app.core.database import SessionLocal
        from app.seed import bootstrap_admin

        try:
            with SessionLocal() as db:
                logger.info(bootstrap_admin(db))
        except Exception:  # never block the API from starting
            logger.exception("Admin bootstrap failed")
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        lifespan=lifespan,
        title=settings.APP_NAME,
        version="1.0.0",
        description=(
            "REST API for patient registration, eye examinations, follow-ups and reporting. "
            "Authenticate via `POST /api/auth/login` and use the returned access token as a Bearer token."
        ),
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
        expose_headers=["Content-Disposition"],
    )

    @app.middleware("http")
    async def security_headers(request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        if request.url.path.startswith("/api/"):
            response.headers.setdefault("Cache-Control", "no-store")
        return response

    register_exception_handlers(app)
    for r in (auth, users, patients, eye_checkups, followups, reports, audit_logs):
        app.include_router(r.router)

    @app.get("/api/health", tags=["Health"])
    def health():
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ok", "database": "ok"}

    @app.get("/api/config", tags=["Health"])
    def public_config():
        """Non-sensitive settings the frontend displays (hospital name and address)."""
        return {
            "hospital_name": settings.HOSPITAL_NAME,
            "hospital_address": settings.HOSPITAL_ADDRESS,
            "hospital_phone": settings.HOSPITAL_PHONE,
            "timezone": settings.TIMEZONE,
        }

    return app


app = create_app()
