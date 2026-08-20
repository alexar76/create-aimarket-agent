import json
import runpy
import sys
from pathlib import Path

import pytest

from create_aimarket_agent import cli
from create_aimarket_agent.cli import scaffold, slug, validate_name


def test_slug():
    assert slug("My First Agent") == "my-first-agent"


@pytest.mark.parametrize("name", ["...", "___", "---", "   "])
def test_slug_requires_an_ascii_letter_or_digit(name):
    with pytest.raises(ValueError, match="letter or digit"):
        slug(name)


def test_validate_name_strips_outer_whitespace_and_accepts_safe_punctuation():
    assert validate_name("  Agent_name.v2  ") == "Agent_name.v2"


@pytest.mark.parametrize("name", ['bad"name', "bad\nname", "<script>", "a" * 65])
def test_name_cannot_break_generated_source(name):
    with pytest.raises(ValueError):
        validate_name(name)


def test_scaffold_is_complete(tmp_path: Path):
    target = tmp_path / "weather-agent"
    scaffold(target, name="Weather Agent", kind="data-provider", metis=True)
    manifest = json.loads((target / "capability.json").read_text())
    assert manifest["capability_id"] == "weather-agent.invoke@v1"
    assert manifest["invoke_url"] == "http://127.0.0.1:8080/invoke"
    assert manifest["verification"]["metis"] is True
    assert manifest["provider_pubkey"] == ""
    assert manifest["publisher_id"] == "community"
    assert "__PROJECT_" not in (target / "agent.py").read_text()
    assert (target / "provider_signing.py").is_file()
    assert (target / ".dockerignore").is_file()
    assert (target / ".github/workflows/test.yml").is_file()
    assert "HOST=0.0.0.0" in (target / "Dockerfile").read_text()
    dockerfile = (target / "Dockerfile").read_text()
    assert "AIMARKET_PROVIDER_IDENTITY_FILE=/data/provider.key" in dockerfile
    assert "HEALTHCHECK" in dockerfile
    assert 'CMD ["python", "agent.py"]' in dockerfile
    generated_pyproject = (target / "pyproject.toml").read_text()
    assert 'build-backend = "setuptools.build_meta"' in generated_pyproject
    assert 'py-modules = ["agent", "provider_signing", "configure_provider", "validate_manifest"]' in generated_pyproject
    assert all("__PROJECT_" not in path.read_text(encoding="utf-8") for path in target.rglob("*") if path.is_file())


@pytest.mark.parametrize("kind", ["unknown", "Tool", ""])
def test_scaffold_rejects_unknown_kind(tmp_path: Path, kind):
    with pytest.raises(ValueError, match="kind must be one of"):
        scaffold(tmp_path / "agent", name="Agent", kind=kind, metis=False)


def test_scaffold_refuses_to_overwrite_existing_target(tmp_path: Path):
    target = tmp_path / "existing"
    target.mkdir()
    marker = target / "owned-by-user.txt"
    marker.write_text("keep", encoding="utf-8")
    with pytest.raises(FileExistsError, match="already exists"):
        scaffold(target, name="Agent", kind="tool", metis=False)
    assert marker.read_text(encoding="utf-8") == "keep"


def test_failed_scaffold_leaves_no_partial_target(tmp_path: Path, monkeypatch):
    target = tmp_path / "weather-agent"

    def fail_copy(*args, **kwargs):
        raise OSError("simulated copy failure")

    monkeypatch.setattr("create_aimarket_agent.cli.shutil.copytree", fail_copy)
    with pytest.raises(OSError, match="simulated copy failure"):
        scaffold(target, name="Weather Agent", kind="tool", metis=False)
    assert not target.exists()
    assert not list(tmp_path.glob(".weather-agent.tmp-*"))


def test_scaffold_ignores_installed_template_bytecode(tmp_path: Path, monkeypatch):
    resources = tmp_path / "resources"
    template = resources / "templates" / "base"
    bytecode = template / "__pycache__"
    bytecode.mkdir(parents=True)
    (template / "README.md").write_text("# __PROJECT_NAME__", encoding="utf-8")
    (bytecode / "agent.cpython-312.pyc").write_bytes(b"\xcb\x00binary-bytecode")
    monkeypatch.setattr(cli, "files", lambda package: resources)

    target = scaffold(tmp_path / "generated", name="Safe Agent", kind="tool", metis=False)
    assert (target / "README.md").read_text(encoding="utf-8") == "# Safe Agent"
    assert not (target / "__pycache__").exists()


def test_target_appearing_during_scaffold_is_not_overwritten(tmp_path: Path, monkeypatch):
    target = tmp_path / "raced-agent"
    original_copytree = cli.shutil.copytree

    def copy_and_race(source, destination, *args, **kwargs):
        result = original_copytree(source, destination, *args, **kwargs)
        if Path(destination).name == target.name:
            target.mkdir()
            (target / "external.txt").write_text("preserve", encoding="utf-8")
        return result

    monkeypatch.setattr(cli.shutil, "copytree", copy_and_race)
    with pytest.raises(FileExistsError, match="appeared while scaffolding"):
        scaffold(target, name="Raced Agent", kind="tool", metis=False)
    assert (target / "external.txt").read_text(encoding="utf-8") == "preserve"
    assert not list(tmp_path.glob(".raced-agent.tmp-*"))


def test_main_creates_requested_directory_and_reports_next_steps(tmp_path: Path, capsys):
    target = tmp_path / "custom-output"
    result = cli.main(["Demo Agent", "--kind", "orchestrator", "--no-metis", "--directory", str(target)])
    assert result == 0
    assert json.loads((target / "capability.json").read_text())["verification"]["metis"] is False
    output = capsys.readouterr().out
    assert f"Created Demo Agent in {target}" in output
    assert "configure_provider.py" in output
    assert "uv sync --extra dev" in output
    assert "python -m venv" not in output


def test_main_returns_two_without_leaking_traceback_for_existing_target(tmp_path: Path, capsys):
    target = tmp_path / "existing"
    target.mkdir()
    assert cli.main(["Agent", "--directory", str(target)]) == 2
    captured = capsys.readouterr()
    assert "target already exists" in captured.err
    assert "Traceback" not in captured.err


def test_main_requires_name_when_stdin_is_not_interactive(monkeypatch, capsys):
    monkeypatch.setattr(sys.stdin, "isatty", lambda: False)
    with pytest.raises(SystemExit) as exc:
        cli.main([])
    assert exc.value.code == 2
    assert "name is required" in capsys.readouterr().err


def test_main_prompts_on_interactive_terminal(tmp_path: Path, monkeypatch, capsys):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(sys.stdin, "isatty", lambda: True)
    monkeypatch.setattr("builtins.input", lambda prompt: "Prompt Agent")
    assert cli.main(["--kind", "data-provider"]) == 0
    assert (tmp_path / "prompt-agent" / "capability.json").is_file()
    assert "Created Prompt Agent" in capsys.readouterr().out


def test_module_entrypoint_exits_with_main_result(tmp_path: Path, monkeypatch):
    target = tmp_path / "module-agent"
    monkeypatch.setattr(
        sys,
        "argv",
        ["create-aimarket-agent", "Module Agent", "--directory", str(target)],
    )
    with pytest.warns(RuntimeWarning, match="found in sys.modules"):
        with pytest.raises(SystemExit) as exc:
            runpy.run_module("create_aimarket_agent.cli", run_name="__main__")
    assert exc.value.code == 0
    assert target.is_dir()
