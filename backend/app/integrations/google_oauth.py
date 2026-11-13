import base64
import hashlib
import json
from urllib.parse import urlencode

import httpx
from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings


GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"

PROVIDER_SCOPES: dict[str, tuple[str, ...]] = {
    "classroom": (
        "https://www.googleapis.com/auth/classroom.courses.readonly",
        "https://www.googleapis.com/auth/classroom.coursework.me.readonly",
    ),
    # Restricted scope: metadata only; no message bodies or attachments.
    "gmail": ("https://www.googleapis.com/auth/gmail.metadata",),
    # Restricted scope: file metadata only; no file content download.
    "drive": ("https://www.googleapis.com/auth/drive.metadata.readonly",),
}


class GoogleOAuthConfigurationError(RuntimeError):
    pass


class GoogleOAuthExchangeError(RuntimeError):
    pass


def require_oauth_configuration() -> None:
    if not all((settings.google_client_id, settings.google_client_secret, settings.google_redirect_uri)):
        raise GoogleOAuthConfigurationError("Google OAuth client configuration is incomplete")
    if not settings.google_token_encryption_key:
        raise GoogleOAuthConfigurationError("Google token encryption key is not configured")
    try:
        Fernet(settings.google_token_encryption_key.encode("ascii"))
    except (ValueError, UnicodeEncodeError) as exc:
        raise GoogleOAuthConfigurationError("Google token encryption key is invalid") from exc


def encrypt_secret(value: str) -> str:
    require_oauth_configuration()
    return Fernet(settings.google_token_encryption_key.encode("ascii")).encrypt(value.encode()).decode()


def decrypt_secret(value: str) -> str:
    require_oauth_configuration()
    try:
        return Fernet(settings.google_token_encryption_key.encode("ascii")).decrypt(value.encode()).decode()
    except InvalidToken as exc:
        raise GoogleOAuthConfigurationError("Stored Google credential cannot be decrypted") from exc


def create_code_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def build_authorization_url(provider: str, state: str, verifier: str) -> str:
    if provider not in PROVIDER_SCOPES:
        raise ValueError("Unsupported Google integration")
    require_oauth_configuration()
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": " ".join(PROVIDER_SCOPES[provider]),
        "state": state,
        "code_challenge": create_code_challenge(verifier),
        "code_challenge_method": "S256",
        "access_type": "offline",
        "include_granted_scopes": "true",
        "prompt": "consent",
    }
    return f"{GOOGLE_AUTH_URL}?{urlencode(params)}"


def exchange_authorization_code(code: str, verifier: str) -> dict:
    require_oauth_configuration()
    try:
        response = httpx.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": settings.google_redirect_uri,
                "grant_type": "authorization_code",
                "code_verifier": verifier,
            },
            headers={"Accept": "application/json"},
            timeout=15.0,
        )
        response.raise_for_status()
        token_data = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise GoogleOAuthExchangeError("Google token exchange failed") from exc

    if not isinstance(token_data, dict) or not token_data.get("access_token"):
        raise GoogleOAuthExchangeError("Google returned an invalid token response")
    return token_data


def serialize_token_bundle(token_data: dict, existing_encrypted: str | None = None) -> tuple[str, list[str]]:
    existing: dict = {}
    existing_scopes: list[str] = []
    if existing_encrypted:
        existing = json.loads(decrypt_secret(existing_encrypted))
        existing_scopes = list(existing.get("scopes", []))

    merged = {**existing, **token_data}
    if not token_data.get("refresh_token") and existing.get("refresh_token"):
        merged["refresh_token"] = existing["refresh_token"]

    returned_scopes = str(token_data.get("scope", "")).split()
    scopes = sorted(set(existing_scopes).union(returned_scopes))
    if not scopes:
        scopes = existing_scopes

    merged["scopes"] = scopes
    return encrypt_secret(json.dumps(merged)), scopes
