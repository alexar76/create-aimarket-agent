import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { main, parseArgs } from "../src/cli.mjs";
import { KINDS, scaffold, slug, validateName } from "../src/scaffold.mjs";

function workspace() {
  return mkdtempSync(join(tmpdir(), "create-aimarket-agent-"));
}

function silent() {
  const lines = [];
  return { lines, write: (line) => lines.push(String(line)), fail: (line) => lines.push(String(line)) };
}

test("slug matches the Python generator", () => {
  assert.equal(slug("Demo Agent"), "demo-agent");
  assert.equal(slug("  Weather..Oracle  "), "weather-oracle");
  assert.equal(slug("A1"), "a1");
  assert.throws(() => slug("---"), /must contain a letter or digit/);
});

test("name validation matches the Python generator", () => {
  assert.equal(validateName(" Demo Agent "), "Demo Agent");
  assert.throws(() => validateName(""), /1-64 characters/);
  assert.throws(() => validateName("-leading-dash"), /1-64 characters/);
  assert.throws(() => validateName("../escape"), /1-64 characters/);
  assert.throws(() => validateName("name;rm -rf"), /1-64 characters/);
  assert.throws(() => validateName("x".repeat(65)), /1-64 characters/);
  assert.equal(validateName("x".repeat(64)).length, 64);
});

test("scaffold writes a complete project and substitutes every placeholder", () => {
  const target = join(workspace(), "demo-agent");
  scaffold(target, { name: "Demo Agent", kind: "tool", metis: true });
  const manifest = JSON.parse(readFileSync(join(target, "capability.json"), "utf8"));
  assert.equal(manifest.product_id, "demo-agent");
  assert.equal(manifest.capability_id, "demo-agent.invoke@v1");
  assert.equal(manifest.name, "Demo Agent");
  assert.equal(manifest.verification.metis, true);
  for (const relative of ["src/agent.ts", "src/providerSigning.ts", "src/canonicalJson.ts",
    "scripts/configureProvider.ts", "scripts/validateManifest.ts", "test/agent.test.ts",
    "package.json", "tsconfig.json", "Dockerfile", "README.md",
    ".gitignore", ".dockerignore", ".env.example", ".github/workflows/test.yml"]) {
    assert.ok(existsSync(join(target, relative)), `${relative} is missing`);
  }
  assert.equal(JSON.parse(readFileSync(join(target, "package.json"), "utf8")).name, "demo-agent");
});

test("--no-metis turns verification off in the manifest and the agent", () => {
  const target = join(workspace(), "demo-agent");
  scaffold(target, { name: "Demo Agent", kind: "data-provider", metis: false });
  const manifest = JSON.parse(readFileSync(join(target, "capability.json"), "utf8"));
  assert.equal(manifest.verification.metis, false);
  assert.match(manifest.description, /data-provider/);
  assert.match(readFileSync(join(target, "src/agent.ts"), "utf8"), /METIS_ENABLED = false/);
});

test("an unknown kind is refused before anything is written", () => {
  const root = workspace();
  const target = join(root, "demo-agent");
  assert.throws(() => scaffold(target, { name: "Demo Agent", kind: "wallet", metis: true }), /kind must be one of/);
  assert.equal(existsSync(target), false);
  assert.deepEqual(readdirSync(root), []);
});

test("an existing target is never overwritten and leaves no staging directory", () => {
  const root = workspace();
  const target = join(root, "demo-agent");
  writeFileSync(target, "keep me", "utf8");
  assert.throws(() => scaffold(target, { name: "Demo Agent", kind: "tool", metis: true }), /already exists/);
  assert.equal(readFileSync(target, "utf8"), "keep me");
  assert.deepEqual(readdirSync(root), ["demo-agent"]);
});

test("every kind scaffolds", () => {
  for (const kind of KINDS) {
    const target = join(workspace(), "demo-agent");
    scaffold(target, { name: "Demo Agent", kind, metis: true });
    assert.match(readFileSync(join(target, "src/agent.ts"), "utf8"), new RegExp(`AGENT_KIND = "${kind}"`));
  }
});

test("the generated key directory is not world readable", () => {
  const target = join(workspace(), "demo-agent");
  scaffold(target, { name: "Demo Agent", kind: "tool", metis: true });
  assert.match(readFileSync(join(target, ".gitignore"), "utf8"), /\.aimarket\//);
  assert.equal(statSync(join(target, "package.json")).isFile(), true);
});

test("parseArgs mirrors the Python flag surface", () => {
  assert.deepEqual(parseArgs([]), { name: undefined, kind: "tool", metis: true, directory: undefined, help: false });
  assert.deepEqual(parseArgs(["My Agent", "--kind", "orchestrator", "--no-metis"]),
    { name: "My Agent", kind: "orchestrator", metis: false, directory: undefined, help: false });
  assert.equal(parseArgs(["--kind=data-provider"]).kind, "data-provider");
  assert.equal(parseArgs(["--directory=/tmp/x"]).directory, "/tmp/x");
  assert.throws(() => parseArgs(["--kind"]), /requires a value/);
  assert.throws(() => parseArgs(["--wat"]), /unknown option/);
  assert.throws(() => parseArgs(["a", "b"]), /unexpected argument/);
});

test("main reports success and failure through exit codes", async () => {
  const root = workspace();
  const target = join(root, "generated");
  const created = silent();
  assert.equal(await main(["Demo Agent", "--directory", target], created), 0);
  assert.match(created.lines.join("\n"), /Created Demo Agent/);

  const repeated = silent();
  assert.equal(await main(["Demo Agent", "--directory", target], repeated), 2);
  assert.match(repeated.lines.join("\n"), /already exists/);

  const rejected = silent();
  assert.equal(await main(["../escape", "--directory", join(root, "other")], rejected), 2);
  assert.equal(existsSync(join(root, "other")), false);

  const help = silent();
  assert.equal(await main(["--help"], help), 0);
  assert.match(help.lines.join("\n"), /usage: create-aimarket-agent/);
});
