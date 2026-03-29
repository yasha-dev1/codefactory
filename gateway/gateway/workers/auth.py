"""Worker authentication utilities."""

import hashlib
import secrets

from fastapi import Header, HTTPException


def generate_token() -> tuple[str, str]:
    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    return token, token_hash


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def verify_registration_secret(x_registration_secret: str = Header(...)) -> str:
    from gateway.config import settings

    if not secrets.compare_digest(x_registration_secret, settings.registration_secret):
        raise HTTPException(status_code=403, detail="Invalid registration secret")
    return x_registration_secret
