from __future__ import annotations

import json
from pathlib import Path

from provider_signing import ProviderSigner


def main() -> int:
    signer = ProviderSigner()
    path = Path("capability.json")
    manifest = json.loads(path.read_text(encoding="utf-8"))
    manifest["provider_pubkey"] = signer.public_key_b64
    temporary = path.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)
    print(f"provider identity ready: {signer.public_key_b64}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
