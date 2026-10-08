from __future__ import annotations

import argparse
import re
import shutil
import sys
import tempfile
from importlib.resources import files
from pathlib import Path

KINDS = ("tool", "data-provider", "orchestrator")
_SAFE_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 ._-]{0,63}$")


def slug(value: str) -> str:
    clean = re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")
    if not clean:
        raise ValueError("project name must contain a letter or digit")
    return clean


def validate_name(value: str) -> str:
    value = value.strip()
    if not _SAFE_NAME.fullmatch(value):
        raise ValueError(
            "project name must be 1-64 characters and contain only letters, digits, spaces, dots, dashes, or underscores"
        )
    return value


def scaffold(target: Path, *, name: str, kind: str, metis: bool) -> Path:
    name = validate_name(name)
    if kind not in KINDS:
        raise ValueError(f"kind must be one of: {', '.join(KINDS)}")
    target = target.resolve()
    if target.exists():
        raise FileExistsError(f"target already exists: {target}")
    template = files("create_aimarket_agent").joinpath("templates/base")
    target.parent.mkdir(parents=True, exist_ok=True)
    stage_root = Path(tempfile.mkdtemp(prefix=f".{target.name}.tmp-", dir=target.parent))
    staged = stage_root / target.name
    replacements = {
        "__PROJECT_NAME__": name,
        "__PROJECT_SLUG__": slug(name),
        "__AGENT_KIND__": kind,
        "__METIS_ENABLED__": "true" if metis else "false",
        "__METIS_PYTHON__": "True" if metis else "False",
    }
    try:
        shutil.copytree(
            str(template),
            staged,
            ignore=shutil.ignore_patterns("__pycache__", "*.pyc", "*.pyo"),
        )
        for path in staged.rglob("*"):
            if path.is_file():
                text = path.read_text(encoding="utf-8")
                for old, new in replacements.items():
                    text = text.replace(old, new)
                path.write_text(text, encoding="utf-8")
        if target.exists():
            raise FileExistsError(f"target appeared while scaffolding: {target}")
        staged.rename(target)
    finally:
        shutil.rmtree(stage_root, ignore_errors=True)
    return target


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="create-aimarket-agent")
    p.add_argument("name", nargs="?", help="project name")
    p.add_argument("--kind", choices=KINDS, default="tool")
    p.add_argument("--metis", action=argparse.BooleanOptionalAction, default=True)
    p.add_argument("--directory", type=Path, help="output directory")
    return p


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    name = args.name
    if not name and sys.stdin.isatty():
        name = input("Agent name: ").strip()
    if not name:
        parser().error("name is required")
    try:
        name = validate_name(name)
        target = args.directory or Path.cwd() / slug(name)
        scaffold(target, name=name, kind=args.kind, metis=args.metis)
    except (ValueError, FileExistsError, OSError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    print(f"Created {name} in {target}")
    print(f"Next: cd {target} && uv sync --extra dev")
    print("Then: uv run python configure_provider.py && uv run pytest && uv run python agent.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
