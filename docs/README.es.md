# create-aimarket-agent

[English](../README.md) · [Русский](README.ru.md) · **Español** · [Français](README.fr.md) · [中文](README.zh.md) · [Glosario](https://github.com/alexar76/aicom/blob/main/docs/localization-glossary.md)

Generador de un proveedor autónomo de AIMarket Protocol v2 con manifiesto de capacidad, pruebas,
Docker y firma Ed25519 vinculada a la solicitud.

## Inicio rápido

```bash
uvx create-aimarket-agent my-agent --kind tool --metis
cd my-agent
uv sync --extra dev
uv run python configure_provider.py
uv run pytest
uv run python validate_manifest.py
uv run python agent.py
```

Los comandos, flags, nombres de archivo e identificadores son iguales en todos los idiomas.

### ¿Prefiere TypeScript?

```bash
npx create-aimarket-agent my-agent
cd my-agent
npm install && npm run configure && npm test && npm run dev
```

La variante TypeScript genera un proveedor `node:http` **sin dependencias en tiempo de ejecución** y
con el mismo `capability.json`. Ambas variantes firman sobres byte a byte idénticos, así que un
consumidor escrito en cualquiera de los dos lenguajes verifica a cualquiera de los dos proveedores:
una prueba de paridad entre lenguajes en el paquete npm falla si difiere un solo byte. Véase la
[documentación](typescript.es.md).

## Tutorial completo: crear un agente útil

El tutorial convierte la plantilla en **THEMIS**, un agente real de compras y
seguridad con política determinista, cálculo de costes, mapeo OWASP Agentic, verificación Metis
asíncrona y perezosa, y resultados firmados.

[Abrir el tutorial en español](tutorials/themis.es.md) ·
[ver el repositorio terminado](https://github.com/alexar76/themis)

## Repositorio generado

- `agent.py`: endpoints health e invoke de FastAPI.
- `capability.json`: manifiesto de capacidad AIMarket Protocol v2.
- `provider_signing.py`: identidad Ed25519 persistente del proveedor.
- `configure_provider.py`: escribe `provider_pubkey` de forma atómica.
- `validate_manifest.py`: validación fail-closed antes de publicar.
- `test_agent.py`: pruebas de API, firma vinculada y límite de solicitud.
- `Dockerfile`, `.dockerignore` y GitHub Actions.

## Seguridad

La generación es atómica: un error no deja un repositorio parcial. El nombre del proyecto pasa por
una allowlist. La clave privada es un seed Ed25519 de 32 bytes con modo `0600`; se rechazan symlinks
y archivos no regulares. La firma vincula el resultado a `capability_id`, `product_id` y al resumen
criptográfico SHA-256 del input, evitando replay entre solicitudes. La publicación no es automática:
el servicio solo acepta la identidad de producto y capacidad declarada en el manifiesto, por lo que
un invocador no confiable no puede hacer que la clave firme otra identidad. El validador rechaza
claves JSON duplicadas, claves Ed25519 incorrectas, precios no finitos y URL HTTP públicas. La
garantía, identidad del proveedor, política de confianza y registro en Hub siguen siendo acciones explícitas.

## Tipos de proyecto

```bash
create-aimarket-agent my-tool --kind tool
create-aimarket-agent my-data --kind data-provider
create-aimarket-agent my-orchestrator --kind orchestrator
create-aimarket-agent my-agent --no-metis
```

## Docker

El contenedor generado se ejecuta sin root, escucha en `0.0.0.0:8080` y guarda la clave en
`/data/provider.key` e incluye un health check. Haz una copia antes de publicar: cambiarla rompe el
`provider_pubkey` registrado en Hub. Mantén el puerto solo en loopback hasta disponer de HTTPS ingress
y límites de concurrencia y frecuencia; la firma de respuesta no autoriza llamadas directas.

Los términos `proveedor`, `verificación`, `garantía` y `resumen criptográfico (digest)` siguen el
glosario. Código, comandos, campos API, env vars, marcas, `LIVE` y `SIM` no se traducen.

## Licencia

MIT — consulta [LICENSE](../LICENSE).
