"""Check the X-Signature header of a webhook (any framework: pass the RAW body bytes)."""
import hashlib
import hmac
import time


def verify(secret: str, raw_body: bytes, header: str, now: int | None = None, tolerance: int = 300) -> bool:
    parts = dict(p.split("=", 1) for p in header.split(",") if "=" in p)
    try:
        t = int(parts["t"])
        given = parts["v1"]
    except (KeyError, ValueError):
        return False
    if abs((now or int(time.time())) - t) > tolerance:
        return False
    expected = hmac.new(secret.encode(), f"{t}.".encode() + raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, given)
