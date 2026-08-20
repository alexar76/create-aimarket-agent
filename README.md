<!-- aicom-mirror-notice -->
> **📖 Read-only mirror.** `create-aimarket-agent` is published from the canonical AI-Factory monorepo.
> **Pull requests are not accepted** — any commit pushed here is overwritten by
> `scripts/mirror_satellites.sh` on the next sync.
> 🐞 Found a bug or have a request? Please **[open an issue](https://github.com/alexar76/create-aimarket-agent/issues)**.

# create-aimarket-agent

<p align="center">
  <strong>From an empty directory to a signed AIMarket Protocol v2 provider.</strong><br>
  A safe, deterministic project generator with tests, Docker packaging, and explicit publishing.
</p>

<!-- aicom-readme-badges -->
<p align="center">
  <a href="https://github.com/alexar76/create-aimarket-agent/actions/workflows/ci.yml"><img src="https://github.com/alexar76/create-aimarket-agent/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/alexar76/create-aimarket-agent/actions/workflows/pages.yml"><img src="https://github.com/alexar76/create-aimarket-agent/actions/workflows/pages.yml/badge.svg" alt="Pages deploy" /></a>
  <img src="https://img.shields.io/badge/python-%3E%3D3.11-3776AB" alt="Python >=3.11" />
  <img src="https://img.shields.io/badge/tests-45%20passing-4c1" alt="45 tests passing" />
  <img src="https://img.shields.io/badge/branch%20coverage-100%25-4c1" alt="100% branch coverage" />
  <img src="https://img.shields.io/badge/docs-EN%20RU%20ES%20FR%20ZH-9c70ff" alt="Documentation in 5 languages" />
  <img src="https://img.shields.io/badge/AIMarket-Protocol%20v2-35e7ff" alt="AIMarket Protocol v2" />
  <img src="https://img.shields.io/badge/signing-Ed25519-8d83ff" alt="Ed25519 signing" />
  <a href="https://github.com/alexar76/create-aimarket-agent/blob/main/LICENSE"><img src="https://raw.githubusercontent.com/alexar76/create-aimarket-agent/main/docs/badges/license.svg" alt="License: MIT" /></a>
</p>
<!-- /aicom-readme-badges -->

<p align="center">
  <a href="README.md"><b>English</b></a> ·
  <a href="docs/README.ru.md">Русский</a> ·
  <a href="docs/README.es.md">Español</a> ·
  <a href="docs/README.fr.md">Français</a> ·
  <a href="docs/README.zh.md">中文</a> ·
  <a href="https://github.com/alexar76/aicom/blob/main/docs/localization-glossary.md">Localization glossary</a>
</p>

## Quick start

> **Distribution status:** `create-aimarket-agent` is not published to PyPI yet. Because `uvx`
> searches the package registry by default, the short `uvx create-aimarket-agent ...` command will
> fail until the first release is published.

Run from this source checkout today:

```bash
uv sync --extra dev
uv run create-aimarket-agent my-agent --kind tool --metis
cd my-agent
uv sync --extra dev
uv run python configure_provider.py
uv run pytest
uv run python validate_manifest.py
uv run python agent.py
```

After `create-aimarket-agent` is published to PyPI, the zero-install command will be:

```bash
uvx create-aimarket-agent my-agent --kind tool --metis
```

The command, identifiers, flags, and generated filenames are stable in every language.

## Generated repository

| Path | Role |
|---|---|
| `agent.py` | FastAPI health and invoke endpoints |
| `capability.json` | AIMarket Protocol v2 capability manifest |
| `provider_signing.py` | Persistent Ed25519 identity and request-bound response signing |
| `configure_provider.py` | Writes the public provider key into the manifest atomically |
| `validate_manifest.py` | Fail-closed structural validation before publishing |
| `test_agent.py` | API, request-bound signature, and request-size tests |
| `Dockerfile` · `.dockerignore` | Non-root container packaging with persistent key volume |
| `.github/workflows/test.yml` | Generated-project CI |

## Security model

- Scaffolding is atomic: a failed copy or replacement leaves no partial target repository.
- Project names are allow-listed before they enter source or JSON files.
- The provider key is a 32-byte Ed25519 seed stored with mode `0600`; symlinks and non-regular files are rejected.
- Responses sign a canonical request-bound envelope containing `capability_id`, `product_id`, the SHA-256 input digest, and the result. This prevents replay across requests.
- The generated service accepts only the product and capability identity declared in its manifest,
  so an untrusted caller cannot make the provider key sign another identity.
- The manifest validator rejects duplicate JSON keys, malformed Ed25519 keys, non-finite prices,
  malformed URLs, and public HTTP endpoints before the publish step.
- The default invoke endpoint rejects missing, malformed, or oversized request bodies.
- Publishing is never automatic. Stake, publisher identity, trust policy, and Hub registration remain explicit operator actions.

## Project kinds

```bash
create-aimarket-agent my-tool --kind tool
create-aimarket-agent my-data --kind data-provider
create-aimarket-agent my-orchestrator --kind orchestrator
create-aimarket-agent my-agent --no-metis
```

## Docker

The generated image runs as an unprivileged user, includes a health check, listens on
`0.0.0.0:8080`, and stores the provider key in `/data/provider.key`.

```bash
docker build -t my-agent .
docker run --read-only --tmpfs /tmp -p 127.0.0.1:8080:8080 -v my-agent-key:/data my-agent
```

Back up the provider key before publishing. Replacing it invalidates the `provider_pubkey`
registered with the Hub. Keep the port loopback-only until an HTTPS ingress provides production
traffic, concurrency, and rate limits; the response signature does not authorize direct callers.

## Development of this generator

```bash
uv sync --extra dev
uv run pytest
uv build --wheel
```

## Localization contract

Documentation is available in English, Russian, Spanish, French, and Chinese and follows the
canonical [AICOM localization glossary](https://github.com/alexar76/aicom/blob/main/docs/localization-glossary.md).
Code, commands, flags, filenames, API fields, env vars, brands, `LIVE`, and `SIM` are never translated.

## License

MIT — see [LICENSE](LICENSE).
