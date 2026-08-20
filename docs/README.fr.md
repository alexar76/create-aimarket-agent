# create-aimarket-agent

[English](../README.md) · [Русский](README.ru.md) · [Español](README.es.md) · **Français** · [中文](README.zh.md) · [Glossaire](https://github.com/alexar76/aicom/blob/main/docs/localization-glossary.md)

Générateur d’un fournisseur autonome AIMarket Protocol v2 avec manifeste de capacité, tests,
Docker et signature Ed25519 liée à la requête.

## Démarrage rapide

> **Statut de distribution :** `create-aimarket-agent` n’est pas encore publié sur PyPI. Comme
> `uvx` recherche le paquet dans le registre par défaut, la commande courte
> `uvx create-aimarket-agent ...` échouera jusqu’à la publication de la première version.

Pour le moment, exécutez le générateur depuis cette copie locale des sources :

```bash
uv sync --extra dev
uv run create-aimarket-agent my-agent --kind tool --metis
cd my-agent
uv sync --extra dev
uv run python configure_provider.py
uv run pytest
uv run python validate_manifest.py
uv run python agent.py
```

Après la publication de `create-aimarket-agent` sur PyPI, la commande sans installation sera :

```bash
uvx create-aimarket-agent my-agent --kind tool --metis
```

Les commandes, flags, noms de fichiers et identifiants restent identiques dans toutes les langues.

## Dépôt généré

- `agent.py` : endpoints health et invoke FastAPI.
- `capability.json` : manifeste de capacité AIMarket Protocol v2.
- `provider_signing.py` : identité Ed25519 persistante du fournisseur.
- `configure_provider.py` : écrit `provider_pubkey` de façon atomique.
- `validate_manifest.py` : validation fail-closed avant publication.
- `test_agent.py` : tests API, signature liée et limite de requête.
- `Dockerfile`, `.dockerignore` et GitHub Actions.

## Sécurité

La génération est atomique : une erreur ne laisse aucun dépôt partiel. Le nom du projet passe par
une allowlist. La clé privée est un seed Ed25519 de 32 octets en mode `0600` ; les symlinks et les
fichiers non réguliers sont rejetés. La signature lie le résultat à `capability_id`, `product_id` et
à l’empreinte (digest) SHA-256 de l’input, empêchant le replay entre requêtes. Le service n’accepte
que l’identité du produit et de la capacité déclarée dans le manifeste : un appelant non fiable ne
peut pas faire signer une autre identité. Le validateur rejette les clés JSON dupliquées, une clé
Ed25519 incorrecte, les prix non finis et les URL HTTP publiques. La publication reste explicite :
caution, identité du fournisseur, politique de confiance et enregistrement dans Hub.

## Types de projet

```bash
create-aimarket-agent my-tool --kind tool
create-aimarket-agent my-data --kind data-provider
create-aimarket-agent my-orchestrator --kind orchestrator
create-aimarket-agent my-agent --no-metis
```

## Docker

Le conteneur généré s’exécute sans root, écoute sur `0.0.0.0:8080` et conserve la clé dans
`/data/provider.key` et inclut un health check. Sauvegardez-la avant publication : la remplacer
invalide le `provider_pubkey` enregistré dans Hub. Gardez le port limité au loopback avant la mise en
place d’un HTTPS ingress et de limites de concurrence et de fréquence ; la signature de réponse
n’autorise pas les appelants directs.

Les termes `fournisseur`, `vérification`, `caution` et `empreinte (digest)` suivent le glossaire.
Code, commandes, champs API, env vars, marques, `LIVE` et `SIM` ne sont pas traduits.

## Licence

MIT — voir [LICENSE](../LICENSE).
