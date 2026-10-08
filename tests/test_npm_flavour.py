"""The npm flavour must stay in step with the Python generator.

Two generators that drift apart would publish two different protocols under one
name, so the shared surface — manifest, project-name rules, kinds, flags — is
compared here instead of being maintained by hand.
"""
from __future__ import annotations

import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

from create_aimarket_agent.cli import KINDS, _SAFE_NAME

ROOT = Path(__file__).resolve().parents[1]
NPM = ROOT / "npm"
PYTHON_TEMPLATE = ROOT / "src" / "create_aimarket_agent" / "templates" / "base"
NPM_TEMPLATE = NPM / "templates" / "base"


def test_npm_package_is_publishable_as_create_aimarket_agent():
    package = json.loads((NPM / "package.json").read_text(encoding="utf-8"))
    assert package["name"] == "create-aimarket-agent"
    assert package["bin"] == {"create-aimarket-agent": "bin/cli.mjs"}
    assert package["version"] == _pyproject_version()
    for entry in ("bin", "src", "templates", "README.md", "LICENSE"):
        assert entry in package["files"], entry
    assert not package.get("dependencies"), "the generator itself must stay dependency-free"
    assert (NPM / "README.md").is_file()
    assert (NPM / "LICENSE").is_file()


def _pyproject_version() -> str:
    text = (ROOT / "pyproject.toml").read_text(encoding="utf-8")
    match = re.search(r'^version = "([^"]+)"', text, re.MULTILINE)
    assert match
    return match.group(1)


def test_both_flavours_emit_the_same_manifest():
    assert (NPM_TEMPLATE / "capability.json").read_text(encoding="utf-8") == (
        PYTHON_TEMPLATE / "capability.json"
    ).read_text(encoding="utf-8")


def test_project_name_rules_are_identical():
    scaffold = (NPM / "src" / "scaffold.mjs").read_text(encoding="utf-8")
    assert f"/{_SAFE_NAME.pattern}/" in scaffold, "the JavaScript name regex drifted from Python"
    kinds = re.search(r"export const KINDS = \[(.*?)\];", scaffold, re.DOTALL)
    assert kinds
    assert tuple(re.findall(r'"([^"]+)"', kinds.group(1))) == KINDS


def test_the_flag_surface_is_identical():
    cli = (NPM / "src" / "cli.mjs").read_text(encoding="utf-8")
    for flag in ("--kind", "--metis", "--no-metis", "--directory"):
        assert flag in cli, flag


def test_dotfiles_ship_under_an_underscore_so_npm_keeps_them():
    # npm never ships a file literally named `.gitignore` inside a tarball.
    for path in NPM_TEMPLATE.rglob("*"):
        assert not path.name.startswith("."), f"{path} would be dropped from the npm tarball"
    for expected in ("_gitignore", "_dockerignore", "_env.example", "_github/workflows/test.yml"):
        assert (NPM_TEMPLATE / expected).exists(), expected


def test_the_generated_typescript_project_is_dependency_free_at_runtime():
    package = json.loads((NPM_TEMPLATE / "package.json").read_text(encoding="utf-8"))
    assert not package.get("dependencies")
    assert set(package["devDependencies"]) == {"@types/node", "typescript"}
    for script in ("build", "configure", "validate", "test", "start", "dev"):
        assert script in package["scripts"], script


@pytest.mark.skipif(shutil.which("node") is None, reason="node is unavailable")
def test_the_javascript_generator_tests_pass():
    subprocess.run(
        ["node", "--test", "test/cli.test.mjs"],
        cwd=NPM,
        check=True,
        capture_output=True,
    )
