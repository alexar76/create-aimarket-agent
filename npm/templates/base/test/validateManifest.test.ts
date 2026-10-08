import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { assertNoDuplicateKeys, validate, validateInvokeUrl } from "../scripts/validateManifest.js";

const VALID = {
  product_id: "demo-agent",
  capability_id: "demo-agent.invoke@v1",
  name: "Demo Agent",
  description: "A generated AIMarket tool capability",
  invoke_url: "https://demo.example/invoke",
  publisher_id: "community",
  provider_pubkey: Buffer.alloc(32, 7).toString("base64"),
  price_per_call_usd: 0.001,
  input_schema: { type: "object" },
  output_schema: { type: "object" },
};

function manifestPath(overrides: Record<string, unknown> = {}, raw?: string): string {
  const path = join(mkdtempSync(join(tmpdir(), "manifest-")), "capability.json");
  writeFileSync(path, raw ?? JSON.stringify({ ...VALID, ...overrides }, null, 2), "utf8");
  return path;
}

test("a complete manifest passes", () => {
  validate(manifestPath());
});

test("a missing required field is reported", () => {
  assert.throws(() => validate(manifestPath({ publisher_id: "" })), /missing required fields: publisher_id/);
});

test("identifiers must match the Hub grammar", () => {
  assert.throws(() => validate(manifestPath({ product_id: "bad id" })), /product_id must be alphanumeric/);
  assert.throws(() => validate(manifestPath({ capability_id: "demo-agent.invoke" })), /my\.tool@v1/);
  assert.throws(() => validate(manifestPath({ publisher_id: "tx-consumed:42" })), /reserved Hub bookkeeping prefix/);
});

test("a public invoke URL must use HTTPS while loopback may not", () => {
  validateInvokeUrl("http://127.0.0.1:8080/invoke");
  validateInvokeUrl("http://localhost:8080/invoke");
  validateInvokeUrl("http://[::1]:8080/invoke");
  assert.throws(() => validateInvokeUrl("http://demo.example/invoke"), /must use HTTPS/);
  assert.throws(() => validateInvokeUrl("https://user:pass@demo.example/invoke"), /must not contain credentials/);
  assert.throws(() => validateInvokeUrl("https://demo.example/invoke?key=1"), /query string or fragment/);
  assert.throws(() => validateInvokeUrl("not-a-url"), /malformed|absolute http/);
});

test("prices must be finite and bounded", () => {
  assert.throws(() => validate(manifestPath({ price_per_call_usd: 1001 })), /finite number/);
  assert.throws(() => validate(manifestPath({ price_per_call_usd: true })), /finite number/);
  assert.throws(() => validate(manifestPath({ success_rate_30d: 1.5 })), /finite number/);
});

test("the provider key must be 32 canonical base64 bytes", () => {
  assert.throws(() => validate(manifestPath({ provider_pubkey: "not base64!" })), /canonical base64/);
  assert.throws(() => validate(manifestPath({ provider_pubkey: Buffer.alloc(16).toString("base64") })), /32 Ed25519/);
});

test("schemas must be objects that declare an object type", () => {
  assert.throws(() => validate(manifestPath({ input_schema: { type: "array" } })), /input_schema\.type must be object/);
  assert.throws(() => validate(manifestPath({ output_schema: [] })), /output_schema must be a JSON object/);
});

test("an ambiguous manifest with duplicate keys is refused", () => {
  assertNoDuplicateKeys('{"a": 1, "b": {"a": 2}, "c": [{"a": 3}]}');
  assert.throws(() => assertNoDuplicateKeys('{"a": 1, "a": 2}'), /duplicate key: a/);
  assert.throws(
    () => validate(manifestPath({}, '{"product_id": "a", "product_id": "b"}')),
    /duplicate key: product_id/,
  );
});

test("a colon inside a string value is not mistaken for a key", () => {
  assertNoDuplicateKeys('{"a": "x:y", "b": "x:y"}');
  assertNoDuplicateKeys('{"a": "quote\\" : trap", "b": 1}');
});
