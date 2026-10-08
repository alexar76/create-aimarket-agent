/**
 * Canonical JSON that matches Python's
 * `json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)`.
 *
 * The AIMarket request-bound signature covers this exact byte string, so a
 * provider written in TypeScript and a verifier written in Python must agree
 * character for character. Two divergences are closed deliberately:
 *
 *   - Python sorts object keys by code point; JavaScript's default sort
 *     compares UTF-16 code units, which reorders astral-plane keys.
 *   - Python renders `1.0` as "1.0" while JavaScript renders it as "1". Only
 *     the number values a signer emits are affected, so keep signed results on
 *     integers or strings whenever a value has to survive a language boundary.
 */

function compareCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left);
  const rightPoints = Array.from(right);
  const shared = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < shared; index += 1) {
    const a = leftPoints[index]!.codePointAt(0)!;
    const b = rightPoints[index]!.codePointAt(0)!;
    if (a !== b) {
      return a < b ? -1 : 1;
    }
  }
  return leftPoints.length - rightPoints.length;
}

export function canonicalJson(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      // Python would emit bare NaN/Infinity, which is not JSON and cannot be
      // re-serialised by a verifier. Refuse instead of signing it.
      throw new TypeError("canonical JSON cannot encode a non-finite number");
    }
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, item]) => item !== undefined,
    );
    entries.sort(([a], [b]) => compareCodePoints(a, b));
    const body = entries
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",");
    return `{${body}}`;
  }
  throw new TypeError(`canonical JSON cannot encode ${typeof value}`);
}
