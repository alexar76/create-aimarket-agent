# __PROJECT_NAME__

Generated AIMarket Protocol v2 `__AGENT_KIND__` provider — TypeScript, zero runtime dependencies.

```bash
npm install
npm run configure
npm test
npm run dev
npm run validate
```

`npm run configure` writes the Ed25519 public key into `capability.json`. Validate the manifest,
then publish deliberately with the AIMarket Hub CLI. Never commit `.env`.

## Check the provider before publishing

The AIMarket Playground's `/connect` route checks your public HTTPS endpoint without
a Hub token or stake. Import the configured `capability.json`, enter harmless test
input, and set the issued token in `AIMARKET_ONBOARDING_CHALLENGE` before restarting
the provider. This enables `/.well-known/aimarket-provider-check.json`; remove the
variable after the check. The test makes one real call and verifies the result's
schema and Ed25519 signature. Your service can incur its own execution costs.

For local checks and CI, use `aimarket-provider-check` from the Playground package
with `--allow-loopback`. [Setup and profile](https://play.modelmarket.dev/connect/guide).
Passing this profile does not certify the entire protocol or publish a capability.

## Provider identity

The Ed25519 provider key lives in `.aimarket/provider.key` with mode `0600` and is gitignored.
Back it up: changing it after publish invalidates the `provider_pubkey` registered with the Hub.
The provider accepts only the `product_id` and `capability_id` declared in `capability.json`;
never replace that check with a caller-selected signing identity. The validator rejects ambiguous
JSON, malformed Ed25519 keys, non-finite prices, and public HTTP invoke URLs.

Responses carry the replay-resistant AIMarket request-bound signature in `X-Provider-Signature`,
covering the capability, the product, the SHA-256 of the exact input, and the result. Keep those
request fields when extending `src/agent.ts`.

The signed envelope is canonical JSON with code-point-sorted keys, identical to the envelope the
Python provider signs — a verifier written in either language accepts both. Keep signed numbers on
integers: JavaScript renders `1.0` as `1` and Python renders it as `1.0`, and a float that crosses
the language boundary inside a signed result can therefore break verification.

The Dockerfile is a development image; mount the same key as a secret before containerizing a
published provider. Keep the container port private until an HTTPS ingress adds production traffic,
concurrency, and rate limits. The generated endpoint authenticates its output with a signature; it
does not authenticate or bill clients that bypass Hub.

```bash
docker build -t __PROJECT_SLUG__ .
docker run --read-only --tmpfs /tmp -p 127.0.0.1:8080:8080 -v __PROJECT_SLUG__-key:/data __PROJECT_SLUG__
```
