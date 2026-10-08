from __future__ import annotations

import json
import math
import os
import stat
import subprocess
import sys
from pathlib import Path

import pytest

from create_aimarket_agent.cli import scaffold


def run_python(target: Path, *args: str, check: bool = True, extra_env: dict[str, str] | None = None):
    env = os.environ.copy()
    env["PYTHONPATH"] = str(target)
    env.update(extra_env or {})
    return subprocess.run(
        [sys.executable, *args],
        cwd=target,
        env=env,
        text=True,
        capture_output=True,
        check=check,
    )


def test_generated_repository_configures_validates_and_passes_its_own_tests(tmp_path: Path):
    target = scaffold(
        tmp_path / "weather-agent",
        name="Weather Agent",
        kind="data-provider",
        metis=True,
    )
    first = run_python(target, "configure_provider.py")
    manifest = json.loads((target / "capability.json").read_text(encoding="utf-8"))
    assert manifest["provider_pubkey"] in first.stdout
    assert len(manifest["provider_pubkey"]) == 44
    assert stat.S_IMODE((target / ".aimarket" / "provider.key").stat().st_mode) == 0o600

    second = run_python(target, "configure_provider.py")
    assert manifest["provider_pubkey"] in second.stdout
    assert "structurally ready" in run_python(target, "validate_manifest.py").stdout

    generated_tests = run_python(target, "-m", "pytest", "-q")
    assert generated_tests.returncode == 0
    assert "passed" in generated_tests.stdout


@pytest.mark.parametrize(
    ("mutation", "message"),
    [
        (lambda data: data.pop("provider_pubkey"), "missing required fields: provider_pubkey"),
        (lambda data: data.update(capability_id="bad id"), "capability_id must look like"),
        (lambda data: data.update(invoke_url="file:///tmp/socket"), "absolute http(s) URL"),
        (lambda data: data.update(invoke_url="https://user:password@example.test/invoke"), "must not contain credentials"),
        (lambda data: data.update(invoke_url="http://example.test/invoke"), "public invoke_url must use HTTPS"),
        (lambda data: data.update(invoke_url="https://example.test/invoke?token=secret"), "query string or fragment"),
        (lambda data: data.update(product_id="bad product"), "product_id must be alphanumeric"),
        (lambda data: data.update(publisher_id="tx-consumed:internal"), "reserved Hub bookkeeping prefix"),
        (lambda data: data.update(provider_pubkey="not-base64"), "canonical base64"),
        (lambda data: data.update(price_per_call_usd=math.nan), "must be a finite number"),
        (lambda data: data.update(input_schema={"type": "string"}), "input_schema.type must be object"),
    ],
)
def test_generated_manifest_validator_rejects_unsafe_contracts(tmp_path: Path, mutation, message):
    target = scaffold(tmp_path / "agent", name="Agent", kind="tool", metis=False)
    run_python(target, "configure_provider.py")
    path = target / "capability.json"
    manifest = json.loads(path.read_text(encoding="utf-8"))
    mutation(manifest)
    path.write_text(json.dumps(manifest), encoding="utf-8")
    result = run_python(target, "validate_manifest.py", check=False)
    assert result.returncode != 0
    assert message in result.stderr


@pytest.mark.parametrize(
    ("content", "message"),
    [
        ('{"product_id":"first","product_id":"second"}', "duplicate key: product_id"),
        ("[]", "must contain one JSON object"),
        ("{not-json", "not valid bounded UTF-8 JSON"),
    ],
)
def test_generated_manifest_validator_rejects_ambiguous_json(tmp_path: Path, content, message):
    target = scaffold(tmp_path / "agent", name="Agent", kind="tool", metis=False)
    (target / "capability.json").write_text(content, encoding="utf-8")
    result = run_python(target, "validate_manifest.py", check=False)
    assert result.returncode != 0
    assert message in result.stderr


def test_generated_manifest_validator_rejects_oversized_file(tmp_path: Path):
    target = scaffold(tmp_path / "agent", name="Agent", kind="tool", metis=False)
    (target / "capability.json").write_text(" " * 65_537, encoding="utf-8")
    result = run_python(target, "validate_manifest.py", check=False)
    assert result.returncode != 0
    assert "exceeds 65536 bytes" in result.stderr


def test_generated_signer_rejects_corrupt_key(tmp_path: Path):
    target = scaffold(tmp_path / "agent", name="Agent", kind="tool", metis=False)
    key = target / ".aimarket" / "provider.key"
    key.parent.mkdir()
    key.write_bytes(b"too-short")
    result = run_python(target, "-c", "from provider_signing import ProviderSigner; ProviderSigner()", check=False)
    assert result.returncode != 0
    assert "is corrupted; expected 32 bytes" in result.stderr


def test_generated_signer_rejects_symlink_key(tmp_path: Path):
    target = scaffold(tmp_path / "agent", name="Agent", kind="tool", metis=False)
    outside = tmp_path / "outside.key"
    outside.write_bytes(b"x" * 32)
    key = target / ".aimarket" / "provider.key"
    key.parent.mkdir()
    key.symlink_to(outside)
    result = run_python(target, "-c", "from provider_signing import ProviderSigner; ProviderSigner()", check=False)
    assert result.returncode != 0
    assert "must be a regular file, not a link" in result.stderr
    assert outside.read_bytes() == b"x" * 32


def test_generated_signer_rejects_symlink_key_directory(tmp_path: Path):
    target = scaffold(tmp_path / "agent", name="Agent", kind="tool", metis=False)
    outside = tmp_path / "outside"
    outside.mkdir()
    (target / ".aimarket").symlink_to(outside, target_is_directory=True)
    result = run_python(
        target,
        "-c",
        "from provider_signing import ProviderSigner; ProviderSigner()",
        check=False,
    )
    assert result.returncode != 0
    assert "directory .aimarket must not be a link" in result.stderr
    assert not (outside / "provider.key").exists()


def test_generated_signer_supports_container_identity_path(tmp_path: Path):
    target = scaffold(tmp_path / "agent", name="Agent", kind="tool", metis=False)
    identity = tmp_path / "data" / "provider.key"
    result = run_python(
        target,
        "-c",
        "from provider_signing import ProviderSigner; print(ProviderSigner().path)",
        extra_env={"AIMARKET_PROVIDER_IDENTITY_FILE": str(identity)},
    )
    assert result.stdout.strip() == str(identity)
    assert identity.is_file()
