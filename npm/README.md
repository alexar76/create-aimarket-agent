# create-aimarket-agent (TypeScript)

> **From an empty directory to a signed AIMarket Protocol v2 provider — in Node, with zero runtime dependencies.**

<p align="center">
  <a href="https://github.com/alexar76/create-aimarket-agent/blob/main/npm/README.md"><b>English</b></a> ·
  <a href="https://github.com/alexar76/create-aimarket-agent/blob/main/docs/typescript.ru.md">Русский</a> ·
  <a href="https://github.com/alexar76/create-aimarket-agent/blob/main/docs/typescript.es.md">Español</a> ·
  <a href="https://github.com/alexar76/create-aimarket-agent/blob/main/docs/typescript.fr.md">Français</a> ·
  <a href="https://github.com/alexar76/create-aimarket-agent/blob/main/docs/typescript.zh.md">中文</a> ·
  <a href="https://github.com/alexar76/aicom/blob/main/docs/localization-glossary.md">Localization glossary</a>
</p>

## Quick start

```bash
npx create-aimarket-agent my-agent
cd my-agent
npm install
npm run configure
npm test
npm run dev
```

`npm run dev` serves `GET /health` and `POST /invoke` on `http://127.0.0.1:8080`. Every response
carries an Ed25519 signature over a request-bound envelope, so a consumer can check that the result
belongs to this provider, this capability, and this exact input.

```bash
curl -s http://127.0.0.1:8080/health
curl -si -X POST http://127.0.0.1:8080/invoke \
  -H 'content-type: application/json' \
  -d '{"input":{"hello":"world"}}' | grep -i x-provider-signature
```

## What is generated

| Path | Role |
|---|---|
| `src/agent.ts` | `node:http` server with `/health` and `/invoke`, no framework |
| `src/providerSigning.ts` | Persistent Ed25519 identity and request-bound response signing |
| `src/canonicalJson.ts` | Canonical JSON the signature is computed over |
| `capability.json` | AIMarket Protocol v2 capability manifest |
| `scripts/configureProvider.ts` | Writes the public provider key into the manifest atomically |
| `scripts/validateManifest.ts` | Fail-closed structural validation before publishing |
| `test/*.test.ts` | `node:test` coverage for the API, the signature, and the validator |
| `Dockerfile` · `.dockerignore` | Two-stage, non-root image with a persistent key volume |
| `.github/workflows/test.yml` | CI for the generated project |

The generated service has **no runtime dependencies** — `node:http` and `node:crypto` only.
TypeScript and `@types/node` are development dependencies, and the runtime image ships compiled
JavaScript with an empty `node_modules`.

## Two flavours, one protocol

| | TypeScript | Python |
|---|---|---|
| Scaffold | `npx create-aimarket-agent my-agent` | `uvx create-aimarket-agent my-agent` |
| Server | `node:http` | FastAPI |
| Runtime dependencies | none | `fastapi`, `uvicorn`, `cryptography` |
| Manifest | identical `capability.json` | identical `capability.json` |
| Signature | identical bytes | identical bytes |

Both flavours accept the same flags (`--kind`, `--metis` / `--no-metis`, `--directory`), apply the
same project-name rules, and emit the same manifest. A test in this package scaffolds both, gives
them the same Ed25519 seed, and fails if a single byte of the canonical envelope or the signature
differs — including payloads whose key order differs between Python's code-point sort and
JavaScript's default UTF-16 sort.

## The signed envelope

The `X-Provider-Signature` header is the base64 Ed25519 signature over the canonical JSON of:

```json
{"capability_id":"my-agent.invoke@v1","input_sha256":"<sha256 of canonical input>","product_id":"my-agent","result":{"…":"…"}}
```

Canonical JSON here means: object keys sorted by Unicode code point, no whitespace between tokens,
and non-ASCII characters emitted raw — byte-for-byte what
`json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)` produces in Python.

Verifying a response in Node:

```js
import { createHash, createPublicKey, verify } from "node:crypto";

const health = await (await fetch("http://127.0.0.1:8080/health")).json();
const response = await fetch("http://127.0.0.1:8080/invoke", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ input: { hello: "world" } }),
});
const body = await response.json();

const key = createPublicKey({
  key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(health.provider_pubkey, "base64")]),
  format: "der",
  type: "spki",
});
const envelope = canonicalJson({
  capability_id: "my-agent.invoke@v1",
  product_id: "my-agent",
  input_sha256: createHash("sha256").update(canonicalJson({ hello: "world" }), "utf8").digest("hex"),
  result: body.result,
});
verify(null, Buffer.from(envelope, "utf8"), key, Buffer.from(response.headers.get("x-provider-signature"), "base64"));
```

The same response verifies in Python with `cryptography` and `json.dumps(..., sort_keys=True)`.

**Keep signed numbers on integers.** JavaScript renders `1.0` as `1` and Python renders it as
`1.0`; a float that crosses the language boundary inside a signed result can therefore break
verification. Prices and counters in a result should be integers (or strings) whenever a verifier
in another language may re-serialize them.

## Security model

- Scaffolding is atomic: a failed copy or replacement leaves no partial target repository, and a
  surviving template placeholder deletes the output instead of shipping a broken manifest.
- Project names are allow-listed before they enter source or JSON files.
- The provider key is a 32-byte Ed25519 seed written with `O_EXCL`, `O_NOFOLLOW`, and mode `0600`;
  symlinks and non-regular files are rejected on both write and read.
- Responses sign a request-bound envelope containing `capability_id`, `product_id`, the SHA-256
  input digest, and the result. This prevents replay across requests.
- The service accepts only the product and capability identity declared in its manifest, so an
  untrusted caller cannot make the provider key sign another identity.
- Bodies are refused above 1 MiB and when `Content-Length` is missing or malformed, before the
  request is read.
- The manifest validator rejects duplicate JSON keys, malformed Ed25519 keys, non-finite prices,
  malformed URLs, and public HTTP endpoints before the publish step.
- Publishing is never automatic. Stake, publisher identity, trust policy, and Hub registration
  remain explicit operator actions.

## Flags

```bash
npx create-aimarket-agent my-tool --kind tool
npx create-aimarket-agent my-data --kind data-provider
npx create-aimarket-agent my-orchestrator --kind orchestrator
npx create-aimarket-agent my-agent --no-metis
npx create-aimarket-agent my-agent --directory ./services/my-agent
```

`--metis` (the default) records `"verification": {"metis": true}` in the manifest, which asks the
Hub to route results through Metis verification. `--no-metis` publishes without it.

## Docker

```bash
docker build -t my-agent .
docker run --read-only --tmpfs /tmp -p 127.0.0.1:8080:8080 -v my-agent-key:/data my-agent
```

The image runs as an unprivileged user, has a health check, listens on `0.0.0.0:8080`, and stores
the provider key in `/data/provider.key`. Back up that key before publishing: replacing it
invalidates the `provider_pubkey` registered with the Hub. Keep the port loopback-only until an
HTTPS ingress provides production traffic, concurrency, and rate limits; the response signature
does not authorize direct callers.

## Publish

```bash
npm run validate
aimarket publish capability.json --hub https://modelmarket.dev
```

Validation is structural only. It does not check that the capability does what the manifest claims,
and it does not register anything.

## Development of this generator

```bash
npm install
npm test
```

`npm test` runs the generator's own tests plus the cross-language parity test, which needs `node`,
`python3`, and the `cryptography` package. The parity test is skipped — never silently passed —
when Python is unavailable.

## License

MIT — see [LICENSE](https://github.com/alexar76/create-aimarket-agent/blob/main/LICENSE).
