import { readFileSync, renameSync, writeFileSync } from "node:fs";

import { ProviderSigner } from "../src/providerSigning.js";

const MANIFEST = "capability.json";

const signer = new ProviderSigner();
const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as Record<string, unknown>;
manifest.provider_pubkey = signer.publicKeyBase64;
const temporary = `${MANIFEST}.tmp`;
writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
renameSync(temporary, MANIFEST);
console.log(`provider identity ready: ${signer.publicKeyBase64}`);
