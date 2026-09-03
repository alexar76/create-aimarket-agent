import base64
import hashlib
import json

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from fastapi.testclient import TestClient
from agent import app


def test_health_and_invoke():
    client = TestClient(app)
    assert client.get("/health").json()["ok"] is True
    payload = {
        "input": {"hello": "world"},
        "product_id": "__PROJECT_SLUG__",
        "capability_id": "__PROJECT_SLUG__.invoke@v1",
    }
    response = client.post("/invoke", json=payload)
    body = response.json()
    assert body["success"] is True
    assert body["result"]["received"] == {"hello": "world"}
    signature = base64.b64decode(response.headers["x-provider-signature"], validate=True)
    input_json = json.dumps(payload["input"], sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    canonical = json.dumps({
        "capability_id": payload["capability_id"],
        "product_id": payload["product_id"],
        "input_sha256": hashlib.sha256(input_json.encode()).hexdigest(),
        "result": body["result"],
    }, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    public_key = base64.b64decode(client.get("/health").json()["provider_pubkey"], validate=True)
    Ed25519PublicKey.from_public_bytes(public_key).verify(signature, canonical.encode())
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"


def test_signature_is_bound_to_request_input():
    client = TestClient(app)
    first = client.post("/invoke", json={"input": {"hello": "world"}})
    second = client.post("/invoke", json={"input": {"hello": "another-world"}})
    assert first.headers["x-provider-signature"] != second.headers["x-provider-signature"]


def test_provider_identity_cannot_be_selected_by_the_caller():
    client = TestClient(app)
    assert client.post("/invoke", json={"product_id": "another-product"}).status_code == 400
    assert client.post("/invoke", json={"capability_id": "another.invoke@v1"}).status_code == 400


def test_unused_framework_documentation_routes_are_closed():
    client = TestClient(app)
    assert client.get("/docs").status_code == 404
    assert client.get("/openapi.json").status_code == 404


def test_invalid_payload_is_not_cached():
    response = TestClient(app).post("/invoke", json={"product_id": "x" * 129})
    assert response.status_code == 422
    assert response.headers["cache-control"] == "no-store"


def test_oversized_invoke_is_rejected():
    response = TestClient(app).post("/invoke", content=b"x" * 1_048_577)
    assert response.status_code == 413


def test_invalid_content_length_is_rejected():
    response = TestClient(app).post(
        "/invoke",
        content=b"{}",
        headers={"content-type": "application/json", "content-length": "invalid"},
    )
    assert response.status_code == 413
