# Changelog

Notable changes to `create-aimarket-agent`. Earlier releases: the git history.

## 0.1.1 — 2026-11-03

### Changed
- The generated agent serves `/.well-known/aimarket-provider-check.json` when `AIMARKET_ONBOARDING_CHALLENGE` holds an
  issued token (64 hex characters), so the AIMarket Playground's `/connect` check can verify the provider before it is
  published; without a valid token the route answers 404. The README explains the check, and a test covers the route.
- The generated GitHub workflow pins `actions/checkout` and `actions/setup-python` to commit SHAs.
