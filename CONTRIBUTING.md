<!-- satellite-contributing -->
# Contributing to create-aimarket-agent

This repository is a read-only mirror. Report bugs and proposed patches in
[Issues](https://github.com/alexar76/create-aimarket-agent/issues), with the runtime
version, reproduction and expected result. Direct PRs are not accepted or imported;
mirror synchronization replaces satellite commits. Do not send generator changes
to the Factory repository.

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
