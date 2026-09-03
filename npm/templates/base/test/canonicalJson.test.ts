import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJson } from "../src/canonicalJson.js";

test("keys are sorted by code point, not by UTF-16 code unit", () => {
  const value = { "\u{1F600}": 1, "ﬀ": 2, b: 3 };
  assert.equal(canonicalJson(value), '{"b":3,"ﬀ":2,"\u{1F600}":1}');
  // A default `.sort()` places the astral key first and would produce an
  // envelope the Python verifier never reconstructs.
  assert.notEqual(canonicalJson(value), JSON.stringify(value, Object.keys(value).sort()));
});

test("non-ASCII text is emitted raw, matching ensure_ascii=False", () => {
  assert.equal(canonicalJson({ note: "é ü 中" }), '{"note":"é ü 中"}');
});

test("there is no whitespace between tokens", () => {
  assert.equal(canonicalJson({ a: 1, b: [1, 2], c: { d: null } }), '{"a":1,"b":[1,2],"c":{"d":null}}');
});

test("nested objects are sorted at every depth", () => {
  assert.equal(canonicalJson({ z: { b: 1, a: 2 }, a: [{ d: 1, c: 2 }] }), '{"a":[{"c":2,"d":1}],"z":{"a":2,"b":1}}');
});

test("undefined members are dropped like Python's absent keys", () => {
  assert.equal(canonicalJson({ a: 1, b: undefined }), '{"a":1}');
});

test("a non-finite number is refused instead of signed", () => {
  assert.throws(() => canonicalJson({ price: Number.NaN }), /non-finite/);
  assert.throws(() => canonicalJson({ price: Number.POSITIVE_INFINITY }), /non-finite/);
});

test("control characters use the same escapes as Python", () => {
  assert.equal(canonicalJson({ a: "\n" }), '{"a":"\\n"}');
  assert.equal(canonicalJson({ a: String.fromCharCode(1) }), '{"a":"\\u0001"}');
});

test("booleans and strings that look like numbers keep their type", () => {
  assert.equal(canonicalJson({ a: true, b: "1", c: 1 }), '{"a":true,"b":"1","c":1}');
});
