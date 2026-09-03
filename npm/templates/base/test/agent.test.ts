import assert from "node:assert/strict";
import { createHash, createPublicKey, verify as verifyBytes } from "node:crypto";
import { AddressInfo } from "node:net";
import test, { after, before } from "node:test";

import { CAPABILITY_ID, PRODUCT_ID, createAgentServer, signer } from "../src/agent.js";
import { canonicalJson } from "../src/canonicalJson.js";

const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const server = createAgentServer();
let origin = "";

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

function publicKey(base64: string) {
  return createPublicKey({
    key: Buffer.concat([SPKI_PREFIX, Buffer.from(base64, "base64")]),
    format: "der",
    type: "spki",
  });
}

test("health and invoke produce a request-bound signature", async () => {
  const health = await (await fetch(`${origin}/health`)).json();
  assert.equal(health.ok, true);

  const payload = { input: { hello: "world" }, product_id: PRODUCT_ID, capability_id: CAPABILITY_ID };
  const response = await fetch(`${origin}/invoke`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  assert.equal(body.success, true);
  assert.deepEqual(body.result.received, { hello: "world" });

  const canonical = canonicalJson({
    capability_id: payload.capability_id,
    product_id: payload.product_id,
    input_sha256: createHash("sha256").update(canonicalJson(payload.input), "utf8").digest("hex"),
    result: body.result,
  });
  const signature = Buffer.from(response.headers.get("x-provider-signature") ?? "", "base64");
  assert.ok(verifyBytes(null, Buffer.from(canonical, "utf8"), publicKey(health.provider_pubkey), signature));

  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
});

test("the signature is bound to the request input", async () => {
  const call = async (hello: string) => {
    const response = await fetch(`${origin}/invoke`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: { hello } }),
    });
    await response.json();
    return response.headers.get("x-provider-signature");
  };
  assert.notEqual(await call("world"), await call("another-world"));
});

test("the provider identity cannot be selected by the caller", async () => {
  for (const payload of [{ product_id: "another-product" }, { capability_id: "another.invoke@v1" }]) {
    const response = await fetch(`${origin}/invoke`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    await response.text();
    assert.equal(response.status, 400);
  }
});

test("an over-long identifier is rejected and never cached", async () => {
  const response = await fetch(`${origin}/invoke`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ product_id: "x".repeat(129) }),
  });
  await response.text();
  assert.equal(response.status, 422);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("an oversized body is rejected", async () => {
  const response = await fetch(`${origin}/invoke`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "x".repeat(1_048_577),
  });
  await response.text();
  assert.equal(response.status, 413);
});

test("only the declared routes exist", async () => {
  for (const path of ["/docs", "/openapi.json", "/"]) {
    const response = await fetch(`${origin}${path}`);
    await response.text();
    assert.equal(response.status, 404);
  }
});

test("malformed JSON is refused before it reaches the signer", async () => {
  const response = await fetch(`${origin}/invoke`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{not json",
  });
  await response.text();
  assert.equal(response.status, 422);
});

test("the signer produces the canonical envelope Python verifies", () => {
  const signature = signer.signResult({ ok: 1 }, {
    capabilityId: CAPABILITY_ID,
    productId: PRODUCT_ID,
    input: { b: 2, a: 1 },
  });
  const canonical = canonicalJson({
    capability_id: CAPABILITY_ID,
    product_id: PRODUCT_ID,
    input_sha256: createHash("sha256").update('{"a":1,"b":2}', "utf8").digest("hex"),
    result: { ok: 1 },
  });
  assert.ok(
    verifyBytes(null, Buffer.from(canonical, "utf8"), publicKey(signer.publicKeyBase64), Buffer.from(signature, "base64")),
  );
});
