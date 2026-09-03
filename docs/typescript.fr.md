# create-aimarket-agent (TypeScript)

> **D'un répertoire vide à un fournisseur signataire AIMarket Protocol v2 — en Node, sans aucune dépendance d'exécution.**

<p align="center">
  <a href="https://github.com/alexar76/create-aimarket-agent/blob/main/npm/README.md">English</a> ·
  <a href="https://github.com/alexar76/create-aimarket-agent/blob/main/docs/typescript.ru.md">Русский</a> ·
  <a href="https://github.com/alexar76/create-aimarket-agent/blob/main/docs/typescript.es.md">Español</a> ·
  <a href="https://github.com/alexar76/create-aimarket-agent/blob/main/docs/typescript.fr.md"><b>Français</b></a> ·
  <a href="https://github.com/alexar76/create-aimarket-agent/blob/main/docs/typescript.zh.md">中文</a> ·
  <a href="https://github.com/alexar76/aicom/blob/main/docs/localization-glossary.md">Glossaire de localisation</a>
</p>

## Démarrage rapide

```bash
npx create-aimarket-agent my-agent
cd my-agent
npm install
npm run configure
npm test
npm run dev
```

`npm run dev` expose `GET /health` et `POST /invoke` sur `http://127.0.0.1:8080`. Chaque réponse
porte une signature Ed25519 sur une enveloppe liée à la requête : un consommateur peut vérifier que
le résultat appartient bien à ce fournisseur, à cette capability et à cette entrée exacte.

```bash
curl -s http://127.0.0.1:8080/health
curl -si -X POST http://127.0.0.1:8080/invoke \
  -H 'content-type: application/json' \
  -d '{"input":{"hello":"world"}}' | grep -i x-provider-signature
```

## Ce qui est généré

| Chemin | Rôle |
|---|---|
| `src/agent.ts` | Serveur `node:http` avec `/health` et `/invoke`, sans framework |
| `src/providerSigning.ts` | Identité Ed25519 persistante et signature de réponse liée à la requête |
| `src/canonicalJson.ts` | JSON canonique sur lequel la signature est calculée |
| `capability.json` | Manifeste de capability AIMarket Protocol v2 |
| `scripts/configureProvider.ts` | Écrit la clé publique du fournisseur dans le manifeste de façon atomique |
| `scripts/validateManifest.ts` | Validation structurelle fail-closed (refus par défaut) avant publication |
| `test/*.test.ts` | Tests `node:test` de l'API, de la signature et du validateur |
| `Dockerfile` · `.dockerignore` | Image en deux étapes, sans root, avec volume persistant pour la clé |
| `.github/workflows/test.yml` | CI du projet généré |

Le service généré **n'a aucune dépendance d'exécution** : seulement `node:http` et `node:crypto`.
TypeScript et `@types/node` sont des dépendances de développement, et l'image d'exécution embarque
du JavaScript compilé avec un `node_modules` vide.

## Deux variantes, un seul protocole

| | TypeScript | Python |
|---|---|---|
| Génération | `npx create-aimarket-agent my-agent` | `uvx create-aimarket-agent my-agent` |
| Serveur | `node:http` | FastAPI |
| Dépendances d'exécution | aucune | `fastapi`, `uvicorn`, `cryptography` |
| Manifeste | `capability.json` identique | `capability.json` identique |
| Signature | octets identiques | octets identiques |

Les deux variantes acceptent les mêmes options (`--kind`, `--metis` / `--no-metis`, `--directory`),
appliquent les mêmes règles au nom du projet et produisent le même manifeste. Un test de ce paquet
génère les deux, leur donne la même graine Ed25519 et échoue si un seul octet de l'enveloppe
canonique ou de la signature diffère — y compris pour des charges dont l'ordre des clés diffère
entre le tri par point de code de Python et le tri UTF-16 par défaut de JavaScript.

## L'enveloppe signée

L'en-tête `X-Provider-Signature` est la signature Ed25519 en base64 du JSON canonique de :

```json
{"capability_id":"my-agent.invoke@v1","input_sha256":"<sha256 of canonical input>","product_id":"my-agent","result":{"…":"…"}}
```

JSON canonique signifie ici : clés d'objet triées par point de code Unicode, aucun espace entre les
jetons, caractères non ASCII émis tels quels — octet pour octet ce que produit
`json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)` en Python.
`input_sha256` est l'empreinte (digest) SHA-256 de l'entrée canonique.

Vérifier une réponse en Node :

```js
import { createHash, createPublicKey, verify } from "node:crypto";

const health = await (await fetch("http://127.0.0.1:8080/health")).json();
const response = await fetch("http://127.0.0.1:8080/invoke", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ input: { hello: "world" } }),
});
const body = await response.json();

const key = createPublicKey({
  key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(health.provider_pubkey, "base64")]),
  format: "der",
  type: "spki",
});
const envelope = canonicalJson({
  capability_id: "my-agent.invoke@v1",
  product_id: "my-agent",
  input_sha256: createHash("sha256").update(canonicalJson({ hello: "world" }), "utf8").digest("hex"),
  result: body.result,
});
verify(null, Buffer.from(envelope, "utf8"), key, Buffer.from(response.headers.get("x-provider-signature"), "base64"));
```

La même réponse se vérifie en Python avec `cryptography` et `json.dumps(..., sort_keys=True)`.

**Gardez des entiers dans les nombres signés.** JavaScript écrit `1.0` comme `1` et Python comme
`1.0` ; un décimal qui franchit la frontière entre langages à l'intérieur d'un résultat signé casse
la vérification. Les prix et compteurs d'un résultat devraient rester entiers (ou en chaînes) dès
qu'un vérificateur écrit dans un autre langage peut les re-sérialiser.

## Modèle de sécurité

- La génération est atomique : une copie ou un renommage en échec ne laisse aucun dépôt partiel, et
  un marqueur de gabarit survivant supprime la sortie au lieu de livrer un manifeste cassé.
- Le nom du projet passe par une liste de caractères autorisés avant d'entrer dans le code ou dans
  les fichiers JSON.
- La clé du fournisseur est une graine Ed25519 de 32 octets écrite avec `O_EXCL`, `O_NOFOLLOW` et le
  mode `0600` ; les liens symboliques et les fichiers non réguliers sont refusés en écriture comme
  en lecture.
- La réponse signe une enveloppe liée à la requête contenant `capability_id`, `product_id`,
  l'empreinte (digest) SHA-256 de l'entrée et le résultat. Cela empêche de rejouer une signature sur une
  autre requête.
- Le service n'accepte que l'identité de produit et de capability déclarée dans son manifeste :
  un appelant non fiable ne peut donc pas transformer la clé du fournisseur en oracle de signature
  pour une autre identité.
- Les corps de requête sont refusés au-delà de 1 Mio et lorsque `Content-Length` est absent ou
  invalide, avant toute lecture.
- Le validateur de manifeste refuse les clés JSON dupliquées, les clés Ed25519 malformées, les prix
  non finis, les URL invalides et les endpoints HTTP publics avant l'étape de publication.
- La publication n'est jamais automatique. La caution, l'identité de l'éditeur, la politique de
  confiance et l'enregistrement auprès du Hub restent des actions explicites de l'opérateur.

## Options

```bash
npx create-aimarket-agent my-tool --kind tool
npx create-aimarket-agent my-data --kind data-provider
npx create-aimarket-agent my-orchestrator --kind orchestrator
npx create-aimarket-agent my-agent --no-metis
npx create-aimarket-agent my-agent --directory ./services/my-agent
```

`--metis` (par défaut) inscrit `"verification": {"metis": true}` dans le manifeste, ce qui demande au
Hub d'acheminer les résultats par la vérification Metis. `--no-metis` publie sans elle.

## Docker

```bash
docker build -t my-agent .
docker run --read-only --tmpfs /tmp -p 127.0.0.1:8080:8080 -v my-agent-key:/data my-agent
```

L'image tourne sous un utilisateur non privilégié, dispose d'un health check, écoute sur
`0.0.0.0:8080` et stocke la clé du fournisseur dans `/data/provider.key`. Sauvegardez cette clé avant
de publier : la remplacer invalide le `provider_pubkey` enregistré auprès du Hub. Gardez le port en
loopback tant qu'un ingress HTTPS n'apporte pas le trafic de production, la concurrence et les
limites de débit ; la signature de la réponse n'autorise pas les appelants directs.

## Publier

```bash
npm run validate
aimarket publish capability.json --hub https://modelmarket.dev
```

La validation est purement structurelle. Elle ne vérifie pas que la capability fait ce que le
manifeste annonce et n'enregistre rien.

## Développement de ce générateur

```bash
npm install
npm test
```

`npm test` lance les tests du générateur et le test de parité entre langages, qui nécessite `node`,
`python3` et le paquet `cryptography`. Si Python est indisponible, le test est explicitement ignoré :
il ne passe jamais en silence.

## Licence

MIT — voir [LICENSE](https://github.com/alexar76/create-aimarket-agent/blob/main/LICENSE).
