/**
 * The TypeScript provider and the Python provider sign the same bytes.
 *
 * A signature is only useful if a verifier written in the other language
 * accepts it, so this test scaffolds both flavours, gives them the same
 * Ed25519 seed, and compares the canonical envelope and the signature for
 * payloads chosen to break naive implementations.
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { scaffold } from "../src/scaffold.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PYTHON_TEMPLATE = resolve(HERE, "..", "..", "src", "create_aimarket_agent", "templates", "base");
const SEED = Buffer.from("4f8c2b19a7d3e05f61c48b9d2a7f3016e5c9b48d271a3f60c85b2e97d4a10f3b", "hex");

// Ordinary payload, unicode, a key pair whose code-point order differs from
// JavaScript's default UTF-16 order, and a nested mixture.
const PAYLOADS = [
  { input: { hello: "world" }, result: { message: "ok", received: { hello: "world" }, verification_requested: true } },
  { input: { "ключ": "значение", "é": "ü", z: 1, a: 2 }, result: { note: "unicode stays raw: é ü 中" } },
  { input: { "\u{1F600}": "astral", "ﬀ": "bmp-above-d800", b: 1 }, result: { ordering: "code point" } },
  { input: { nested: { list: [1, 2, { deep: true }], empty: {}, nothing: null } }, result: { count: 3, flags: [true, false] } },
  { input: {}, result: { message: "empty input still signs" } },
];

function pythonAvailable() {
  const probe = spawnSync("python3", ["-c", "import cryptography"], { encoding: "utf8" });
  return probe.status === 0;
}

function buildTypescriptProject() {
  const root = mkdtempSync(join(tmpdir(), "aimarket-parity-ts-"));
  const target = join(root, "parity-agent");
  scaffold(target, { name: "Parity Agent", kind: "tool", metis: true });
  execFileSync("npm", ["install", "--no-audit", "--no-fund", "--silent"], { cwd: target, stdio: "pipe" });
  execFileSync("npm", ["run", "build", "--silent"], { cwd: target, stdio: "pipe" });
  return target;
}

function scaffoldPythonProject() {
  const root = mkdtempSync(join(tmpdir(), "aimarket-parity-py-"));
  const target = join(root, "parity-agent");
  mkdirSync(target, { recursive: true });
  for (const name of ["provider_signing.py"]) {
    writeFileSync(join(target, name), readFileSync(join(PYTHON_TEMPLATE, name), "utf8"), "utf8");
  }
  return target;
}

function writeSeed(directory) {
  const keyDirectory = join(directory, ".aimarket");
  mkdirSync(keyDirectory, { recursive: true, mode: 0o700 });
  const keyPath = join(keyDirectory, "provider.key");
  writeFileSync(keyPath, SEED, { mode: 0o600 });
  return keyPath;
}

const HARNESS_TS = `
import { createHash } from "node:crypto";
import { ProviderSigner } from "./dist/src/providerSigning.js";
import { canonicalJson } from "./dist/src/canonicalJson.js";

const payloads = JSON.parse(process.argv[2]);
const signer = new ProviderSigner(process.argv[3]);
const out = payloads.map(({ input, result }) => ({
  input_json: canonicalJson(input),
  input_sha256: createHash("sha256").update(canonicalJson(input), "utf8").digest("hex"),
  envelope: canonicalJson({
    capability_id: "parity-agent.invoke@v1",
    product_id: "parity-agent",
    input_sha256: createHash("sha256").update(canonicalJson(input), "utf8").digest("hex"),
    result,
  }),
  signature: signer.signResult(result, {
    capabilityId: "parity-agent.invoke@v1",
    productId: "parity-agent",
    input,
  }),
}));
process.stdout.write(JSON.stringify({ public_key: signer.publicKeyBase64, results: out }));
`;

const HARNESS_PY = `
import hashlib, json, sys
from provider_signing import ProviderSigner

payloads = json.loads(sys.argv[1])
signer = ProviderSigner()

def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)

results = []
for entry in payloads:
    payload_input, result = entry["input"], entry["result"]
    digest = hashlib.sha256(canonical(payload_input).encode()).hexdigest()
    results.append({
        "input_json": canonical(payload_input),
        "input_sha256": digest,
        "envelope": canonical({
            "capability_id": "parity-agent.invoke@v1",
            "product_id": "parity-agent",
            "input_sha256": digest,
            "result": result,
        }),
        "signature": signer.sign_result(
            result,
            capability_id="parity-agent.invoke@v1",
            product_id="parity-agent",
            input_payload=payload_input,
        ),
    })
print(json.dumps({"public_key": signer.public_key_b64, "results": results}))
`;

test("TypeScript and Python sign byte-identical envelopes", { skip: pythonAvailable() ? false : "python3 with cryptography is unavailable" }, () => {
  const typescriptProject = buildTypescriptProject();
  writeSeed(typescriptProject);
  writeFileSync(join(typescriptProject, "parity-harness.mjs"), HARNESS_TS, "utf8");
  const typescriptOutput = JSON.parse(
    execFileSync("node", ["parity-harness.mjs", JSON.stringify(PAYLOADS), join(".aimarket", "provider.key")], {
      cwd: typescriptProject,
      encoding: "utf8",
    }),
  );

  const pythonProject = scaffoldPythonProject();
  writeSeed(pythonProject);
  writeFileSync(join(pythonProject, "parity_harness.py"), HARNESS_PY, "utf8");
  const pythonOutput = JSON.parse(
    execFileSync("python3", ["parity_harness.py", JSON.stringify(PAYLOADS)], {
      cwd: pythonProject,
      encoding: "utf8",
    }),
  );

  assert.equal(typescriptOutput.public_key, pythonOutput.public_key, "the same seed must yield the same identity");
  for (let index = 0; index < PAYLOADS.length; index += 1) {
    const fromTypescript = typescriptOutput.results[index];
    const fromPython = pythonOutput.results[index];
    assert.equal(fromTypescript.input_json, fromPython.input_json, `input canonicalisation differs for payload ${index}`);
    assert.equal(fromTypescript.input_sha256, fromPython.input_sha256, `input digest differs for payload ${index}`);
    assert.equal(fromTypescript.envelope, fromPython.envelope, `envelope differs for payload ${index}`);
    assert.equal(fromTypescript.signature, fromPython.signature, `signature differs for payload ${index}`);
  }
});

test("the generated manifest is identical in both flavours", () => {
  const root = mkdtempSync(join(tmpdir(), "aimarket-parity-manifest-"));
  const target = join(root, "parity-agent");
  scaffold(target, { name: "Parity Agent", kind: "tool", metis: true });
  const typescriptManifest = readFileSync(join(target, "capability.json"), "utf8");
  const pythonManifest = readFileSync(join(PYTHON_TEMPLATE, "capability.json"), "utf8")
    .split("__PROJECT_SLUG__").join("parity-agent")
    .split("__PROJECT_NAME__").join("Parity Agent")
    .split("__AGENT_KIND__").join("tool")
    .split("__METIS_ENABLED__").join("true");
  assert.equal(typescriptManifest, pythonManifest);
  assert.ok(existsSync(join(target, "capability.json")));
});
