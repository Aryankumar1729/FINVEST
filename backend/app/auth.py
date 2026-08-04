from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Annotated

import firebase_admin
from fastapi import Header, HTTPException
from firebase_admin import auth as firebase_auth
from firebase_admin import credentials
from firebase_admin.auth import ExpiredIdTokenError, InvalidIdTokenError, RevokedIdTokenError

from . import config as _config  # noqa: F401 — ensures load_dotenv() runs first

logger = logging.getLogger(__name__)

_BACKEND_DIR = Path(__file__).resolve().parent.parent

DEV_USER_UID = "dev-user-local-testing"


def _auth_disabled() -> bool:
    return os.getenv("ENV") == "development" and os.getenv("AUTH_DISABLED") == "true"


def _resolve_credentials_path() -> str:
    raw = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    if not raw:
        raise RuntimeError("GOOGLE_APPLICATION_CREDENTIALS is not set")

    path = Path(raw)
    if path.is_file():
        return str(path.resolve())

    if not path.is_absolute():
        for base in (Path.cwd(), _BACKEND_DIR, _BACKEND_DIR.parent):
            candidate = (base / raw).resolve()
            if candidate.is_file():
                logger.info("Resolved GOOGLE_APPLICATION_CREDENTIALS to %s", candidate)
                return str(candidate)

    raise RuntimeError(f"Firebase credentials file not found: {raw}")


def _init_firebase() -> None:
    if firebase_admin._apps:
        return

    cred_path = _resolve_credentials_path()
    cred = credentials.Certificate(cred_path)
    firebase_admin.initialize_app(cred)
    logger.info("Firebase Admin SDK initialized (project_id=%s)", cred.project_id)


_init_firebase()


def _extract_bearer_token(authorization: str) -> str:
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    return token.strip()


def _verify_firebase_token(token: str) -> str:
    try:
        decoded = firebase_auth.verify_id_token(token)
    except ExpiredIdTokenError as exc:
        raise HTTPException(status_code=401, detail="Token expired") from exc
    except RevokedIdTokenError as exc:
        raise HTTPException(status_code=401, detail="Token revoked") from exc
    except InvalidIdTokenError as exc:
        raise HTTPException(status_code=401, detail="Invalid token") from exc
    except (ValueError, firebase_auth.CertificateFetchError) as exc:
        raise HTTPException(status_code=401, detail="Invalid token") from exc

    uid = decoded.get("uid")
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid token")
    return uid


def get_current_user_id(
    authorization: Annotated[str | None, Header()] = None,
) -> str:
    if _auth_disabled():
        logger.warning(
            "AUTH_DISABLED bypass active — returning dev UID %s without token verification",
            DEV_USER_UID,
        )
        return DEV_USER_UID

    if authorization is None:
        raise HTTPException(status_code=401, detail="Missing authorization header")

    token = _extract_bearer_token(authorization)
    return _verify_firebase_token(token)


def get_optional_user_id(
    authorization: Annotated[str | None, Header()] = None,
) -> str | None:
    if _auth_disabled():
        logger.warning(
            "AUTH_DISABLED bypass active — returning dev UID %s without token verification",
            DEV_USER_UID,
        )
        return DEV_USER_UID

    if authorization is None:
        return None

    token = _extract_bearer_token(authorization)
    return _verify_firebase_token(token)
