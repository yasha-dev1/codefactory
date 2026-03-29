"""GitHub webhook HMAC-SHA256 signature verification."""

import hashlib
import hmac


def verify_github_signature(payload: bytes, signature_header: str, secret: str) -> bool:
    """Verify the GitHub webhook signature.

    Args:
        payload: Raw request body bytes.
        signature_header: Value of X-Hub-Signature-256 header (e.g. "sha256=abc123...").
        secret: The webhook secret configured in GitHub.

    Returns:
        True if signature is valid, False otherwise.
    """
    if not signature_header.startswith("sha256="):
        return False

    expected_signature = hmac.new(
        secret.encode("utf-8"),
        payload,
        hashlib.sha256,
    ).hexdigest()

    received_signature = signature_header[len("sha256="):]
    return hmac.compare_digest(expected_signature, received_signature)
