/**
 * Fail-closed structural validation, kept rule-for-rule in step with the
 * Python `validate_manifest.py` so both flavours refuse the same manifest.
 */
import { lstatSync, readFileSync } from "node:fs";
import { isIP } from "node:net";

const MANIFEST = "capability.json";
const MAX_MANIFEST_BYTES = 65_536;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const CAPABILITY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*@[vV]\d+$/;
const PUBLISHER_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const RESERVED_PUBLISHER_PREFIXES = ["tx-consumed:", "unverified-dev-credit"];

export function fail(message: string): never {
  throw new Error(message);
}

/**
 * `JSON.parse` silently keeps the last of two identical keys, so an ambiguous
 * manifest would validate here and mean something else at the Hub.
 */
export function assertNoDuplicateKeys(text: string): void {
  const scopes: Array<Set<string> | null> = [];
  let index = 0;
  let pendingKey: string | null = null;
  while (index < text.length) {
    const character = text[index]!;
    if (character === "{") {
      scopes.push(new Set());
      index += 1;
    } else if (character === "[") {
      scopes.push(null);
      index += 1;
    } else if (character === "}" || character === "]") {
      scopes.pop();
      index += 1;
    } else if (character === '"') {
      let end = index + 1;
      let value = "";
      while (end < text.length) {
        if (text[end] === "\\") {
          value += text.slice(end, end + 2);
          end += 2;
          continue;
        }
        if (text[end] === '"') {
          break;
        }
        value += text[end];
        end += 1;
      }
      index = end + 1;
      let lookahead = index;
      while (lookahead < text.length && /\s/.test(text[lookahead]!)) {
        lookahead += 1;
      }
      const scope = scopes[scopes.length - 1];
      if (text[lookahead] === ":" && scope instanceof Set) {
        if (scope.has(value)) {
          fail(`capability.json contains duplicate key: ${value}`);
        }
        scope.add(value);
        pendingKey = value;
      } else {
        pendingKey = null;
      }
    } else {
      index += 1;
    }
  }
  void pendingKey;
}

export function readManifest(path = MANIFEST): Record<string, unknown> {
  let info;
  try {
    info = lstatSync(path);
  } catch (error) {
    fail(`cannot inspect capability.json: ${(error as Error).message}`);
  }
  if (info.isSymbolicLink() || !info.isFile()) {
    fail("capability.json must be a regular file, not a link");
  }
  if (info.size > MAX_MANIFEST_BYTES) {
    fail(`capability.json exceeds ${MAX_MANIFEST_BYTES} bytes`);
  }
  const text = readFileSync(path, "utf8");
  assertNoDuplicateKeys(text);
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    fail(`capability.json is not valid bounded UTF-8 JSON: ${(error as Error).message}`);
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    fail("capability.json must contain one JSON object");
  }
  return data as Record<string, unknown>;
}

function finiteNumber(data: Record<string, unknown>, key: string, minimum: number, maximum: number): number {
  const value = data[key];
  if (typeof value === "boolean" || value === null || value === undefined || Array.isArray(value)) {
    fail(`${key} must be a finite number between ${minimum} and ${maximum}`);
  }
  const numeric = typeof value === "string" ? Number(value.trim()) : Number(value);
  if (!Number.isFinite(numeric) || numeric < minimum || numeric > maximum) {
    fail(`${key} must be a finite number between ${minimum} and ${maximum}`);
  }
  return numeric;
}

function isLoopback(rawHostname: string): boolean {
  // WHATWG `URL.hostname` keeps the brackets around an IPv6 literal, while
  // Python's `urlsplit(...).hostname` strips them. Strip them here so both
  // validators treat `http://[::1]:8080` as loopback.
  const hostname = rawHostname.startsWith("[") && rawHostname.endsWith("]")
    ? rawHostname.slice(1, -1)
    : rawHostname;
  if (hostname.toLowerCase() === "localhost") {
    return true;
  }
  if (isIP(hostname) === 4) {
    return hostname.startsWith("127.");
  }
  if (isIP(hostname) === 6) {
    const expanded = hostname.toLowerCase();
    return expanded === "::1" || expanded === "0:0:0:0:0:0:0:1";
  }
  return false;
}

export function validateInvokeUrl(raw: unknown): void {
  if (typeof raw !== "string") {
    fail("invoke_url must be an absolute http(s) URL");
  }
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch (error) {
    fail(`invoke_url is malformed: ${(error as Error).message}`);
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || !url.hostname) {
    fail("invoke_url must be an absolute http(s) URL");
  }
  if (url.username || url.password) {
    fail("invoke_url must not contain credentials");
  }
  if (url.search || url.hash) {
    fail("invoke_url must not contain a query string or fragment");
  }
  if (url.protocol !== "https:" && !isLoopback(url.hostname)) {
    fail("public invoke_url must use HTTPS; HTTP is allowed only for loopback development");
  }
}

function decodeCanonicalBase64(value: unknown): Buffer {
  const text = String(value);
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(text) || text.length === 0 || text.length % 4 !== 0) {
    fail("provider_pubkey must be canonical base64");
  }
  const decoded = Buffer.from(text, "base64");
  if (decoded.toString("base64") !== text) {
    fail("provider_pubkey must be canonical base64");
  }
  return decoded;
}

export function validate(path = MANIFEST): void {
  const data = readManifest(path);
  const required = [
    "product_id",
    "capability_id",
    "name",
    "invoke_url",
    "publisher_id",
    "provider_pubkey",
    "price_per_call_usd",
    "input_schema",
    "output_schema",
  ];
  const missing = required.filter((key) => data[key] === undefined || data[key] === null || data[key] === "");
  if (missing.length > 0) {
    fail(`missing required fields: ${missing.join(", ")}`);
  }
  if (typeof data.product_id !== "string" || !SAFE_ID.test(data.product_id)) {
    fail("product_id must be alphanumeric (dots, dashes, underscores allowed), max 128 chars");
  }
  if (typeof data.capability_id !== "string" || !CAPABILITY_ID.test(data.capability_id)) {
    fail("capability_id must look like my.tool@v1");
  }
  if (typeof data.name !== "string" || data.name.trim().length < 1 || data.name.trim().length > 128) {
    fail("name must contain 1-128 characters");
  }
  const publisherId = data.publisher_id;
  if (typeof publisherId !== "string" || !PUBLISHER_ID.test(publisherId)) {
    fail("publisher_id must be a stable 1-128 character identifier");
  }
  if (RESERVED_PUBLISHER_PREFIXES.some((prefix) => publisherId.startsWith(prefix))) {
    fail("publisher_id uses a reserved Hub bookkeeping prefix");
  }
  validateInvokeUrl(data.invoke_url);
  finiteNumber(data, "price_per_call_usd", 0, 1000);
  if ("p50_latency_ms" in data) {
    finiteNumber(data, "p50_latency_ms", 0, 86_400_000);
  }
  if ("success_rate_30d" in data) {
    finiteNumber(data, "success_rate_30d", 0, 1);
  }
  for (const key of ["input_schema", "output_schema"] as const) {
    const schema = data[key];
    if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
      fail(`${key} must be a JSON object`);
    }
    if ((schema as Record<string, unknown>).type !== "object") {
      fail(`${key}.type must be object`);
    }
  }
  if (decodeCanonicalBase64(data.provider_pubkey).length !== 32) {
    fail("provider_pubkey must encode exactly 32 Ed25519 public-key bytes");
  }
}

const entryPoint = process.argv[1] ?? "";
if (entryPoint.endsWith("validateManifest.js") || entryPoint.endsWith("validateManifest.ts")) {
  try {
    validate();
    console.log("capability.json is structurally ready for AIMarket Hub publish");
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}
