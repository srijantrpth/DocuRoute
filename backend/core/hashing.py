"""Canonical hashing helpers for the tamper-evident audit chain."""

import hashlib
import json

GENESIS_HASH = "0" * 64


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def canonical_json(payload) -> str:
    """Stable JSON: sorted keys, no insignificant whitespace, UTF-8 preserved."""
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str, ensure_ascii=False)


def hash_payload(payload) -> str:
    return sha256_bytes(canonical_json(payload).encode("utf-8"))


def chain_hash(prev_hash: str, payload_hash: str) -> str:
    """Link an event to its predecessor so any edit invalidates every later link."""
    return sha256_bytes(f"{prev_hash or GENESIS_HASH}:{payload_hash}".encode("utf-8"))
