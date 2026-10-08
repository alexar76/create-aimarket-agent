import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as signBytes,
  type KeyObject,
} from "node:crypto";
import { closeSync, constants, fchmodSync, fstatSync, lstatSync, mkdirSync, openSync, readSync, writeSync } from "node:fs";
import { dirname } from "node:path";

import { canonicalJson } from "./canonicalJson.js";

const SEED_BYTES = 32;
// PKCS#8 prefix for a raw Ed25519 seed. Storing the bare 32-byte seed keeps the
// key file byte-identical to the one the Python generator writes.
const PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");
const NO_FOLLOW = (constants as Record<string, number>).O_NOFOLLOW ?? 0;

function privateKeyFromSeed(seed: Buffer): KeyObject {
  return createPrivateKey({
    key: Buffer.concat([PKCS8_PREFIX, seed]),
    format: "der",
    type: "pkcs8",
  });
}

function rawPublicKey(privateKey: KeyObject): Buffer {
  const der = createPublicKey(privateKey).export({ format: "der", type: "spki" });
  return Buffer.from(der.subarray(der.length - SEED_BYTES));
}

function readExistingSeed(path: string): Buffer {
  const pathInfo = lstatSync(path);
  if (pathInfo.isSymbolicLink() || !pathInfo.isFile()) {
    throw new Error(`provider key ${path} must be a regular file, not a link`);
  }
  let descriptor: number;
  try {
    descriptor = openSync(path, constants.O_RDONLY | NO_FOLLOW);
  } catch (error) {
    throw new Error(`provider key ${path} could not be opened safely`, { cause: error });
  }
  try {
    const openedInfo = fstatSync(descriptor);
    if (
      !openedInfo.isFile() ||
      openedInfo.dev !== pathInfo.dev ||
      openedInfo.ino !== pathInfo.ino
    ) {
      throw new Error(`provider key ${path} changed while it was being opened`);
    }
    fchmodSync(descriptor, 0o600);
    const buffer = Buffer.alloc(SEED_BYTES + 1);
    const read = readSync(descriptor, buffer, 0, buffer.length, 0);
    if (read !== SEED_BYTES) {
      throw new Error(`provider key ${path} is corrupted; expected ${SEED_BYTES} bytes`);
    }
    return buffer.subarray(0, SEED_BYTES);
  } finally {
    closeSync(descriptor);
  }
}

function createSeed(path: string): Buffer {
  const { privateKey } = generateKeyPairSync("ed25519");
  const der = privateKey.export({ format: "der", type: "pkcs8" });
  const seed = Buffer.from(der.subarray(der.length - SEED_BYTES));
  const descriptor = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NO_FOLLOW, 0o600);
  try {
    writeSync(descriptor, seed);
  } finally {
    closeSync(descriptor);
  }
  return seed;
}

export class ProviderSigner {
  readonly path: string;
  private readonly privateKey: KeyObject;

  constructor(path: string = process.env.AIMARKET_PROVIDER_KEY_FILE
    ?? process.env.AIMARKET_PROVIDER_IDENTITY_FILE
    ?? ".aimarket/provider.key") {
    this.path = path;
    const parent = dirname(path);
    let parentInfo;
    try {
      parentInfo = lstatSync(parent);
    } catch {
      parentInfo = undefined;
    }
    if (parentInfo?.isSymbolicLink()) {
      throw new Error(`provider key directory ${parent} must not be a link`);
    }
    mkdirSync(parent, { recursive: true, mode: 0o700 });
    let exists = true;
    try {
      lstatSync(path);
    } catch {
      exists = false;
    }
    const seed = exists ? readExistingSeed(path) : createSeed(path);
    this.privateKey = privateKeyFromSeed(seed);
  }

  get publicKeyBase64(): string {
    return rawPublicKey(this.privateKey).toString("base64");
  }

  /**
   * Sign the canonical, request-bound envelope: capability, product, the
   * SHA-256 of the exact input, and the result. Binding the input digest is
   * what stops a signature from being replayed against another request.
   */
  signResult(
    result: unknown,
    options: { capabilityId: string; productId: string; input: unknown },
  ): string {
    const inputJson = canonicalJson(options.input ?? {});
    const canonical = canonicalJson({
      capability_id: options.capabilityId,
      product_id: options.productId,
      input_sha256: createHash("sha256").update(inputJson, "utf8").digest("hex"),
      result,
    });
    return signBytes(null, Buffer.from(canonical, "utf8"), this.privateKey).toString("base64");
  }
}
