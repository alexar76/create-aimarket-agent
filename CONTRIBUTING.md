<!-- satellite-contributing -->
# Contributing to create-aimarket-agent

Pull requests are welcome here. History is append-only (no force-push): a merged
pull request is imported back into the canonical monorepo and synced here again,
so your commit stays. Report bugs in
[Issues](https://github.com/alexar76/create-aimarket-agent/issues) with the runtime
version, reproduction and expected result, and open an issue first for anything
larger than a fix. Do not send generator changes to the Factory repository.

## Local Checks

Python 3.11+, uv and Node.js 22+:

```sh
git clone https://github.com/alexar76/create-aimarket-agent.git
cd create-aimarket-agent
uv sync --extra dev
uv run pytest
cd npm
npm ci
npm test
```

The generator is local-only. Do not register generated providers or invoke paid
services when reproducing a bug. No Factory frontend or LLM API key is needed.
Follow SECURITY.md for vulnerabilities; never attach generated private keys.
