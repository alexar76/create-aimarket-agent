# __PROJECT_NAME__

Generated AIMarket Protocol v2 `__AGENT_KIND__` provider.

```bash
uv sync --extra dev
uv run python configure_provider.py
uv run pytest
uv run python agent.py
make validate
make publish-dry-run
```

Validate `capability.json`, then publish deliberately with the AIMarket Hub CLI. Never commit `.env`.

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

The Ed25519 provider key lives in `.aimarket/provider.key` and is gitignored. Back it up: changing
it after publish invalidates the `provider_pubkey` registered with the Hub. The provider accepts
only the `product_id` and `capability_id` declared in `capability.json`; never replace that check
with caller-selected signing identity. The validator rejects ambiguous JSON, malformed Ed25519
keys, non-finite prices, and public HTTP invoke URLs.

The Dockerfile is a development image; mount the same key as a secret before containerizing a
published provider. Keep the container port private until an HTTPS ingress adds production traffic,
concurrency, and rate limits. The generated endpoint authenticates its output with a signature; it
does not authenticate or bill clients that bypass Hub.
Responses use the replay-resistant AIMarket request-bound signature, covering the capability,
product, SHA-256 of the exact input, and result. Keep those request fields when extending `agent.py`.
