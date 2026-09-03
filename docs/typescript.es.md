# create-aimarket-agent (TypeScript)

> **De un directorio vacío a un proveedor firmante de AIMarket Protocol v2 — en Node, sin dependencias en tiempo de ejecución.**

<p align="center">
  <a href="https://github.com/alexar76/create-aimarket-agent/blob/main/npm/README.md">English</a> ·
  <a href="https://github.com/alexar76/create-aimarket-agent/blob/main/docs/typescript.ru.md">Русский</a> ·
  <a href="https://github.com/alexar76/create-aimarket-agent/blob/main/docs/typescript.es.md"><b>Español</b></a> ·
  <a href="https://github.com/alexar76/create-aimarket-agent/blob/main/docs/typescript.fr.md">Français</a> ·
  <a href="https://github.com/alexar76/create-aimarket-agent/blob/main/docs/typescript.zh.md">中文</a> ·
  <a href="https://github.com/alexar76/aicom/blob/main/docs/localization-glossary.md">Glosario de localización</a>
</p>

## Inicio rápido

```bash
npx create-aimarket-agent my-agent
cd my-agent
npm install
npm run configure
npm test
npm run dev
```

`npm run dev` sirve `GET /health` y `POST /invoke` en `http://127.0.0.1:8080`. Cada respuesta lleva
una firma Ed25519 sobre un sobre ligado a la solicitud, de modo que un consumidor puede comprobar
que el resultado pertenece a este proveedor, a esta capability y a esta entrada exacta.

```bash
curl -s http://127.0.0.1:8080/health
curl -si -X POST http://127.0.0.1:8080/invoke \
  -H 'content-type: application/json' \
  -d '{"input":{"hello":"world"}}' | grep -i x-provider-signature
```

## Qué se genera

| Ruta | Función |
|---|---|
| `src/agent.ts` | Servidor `node:http` con `/health` e `/invoke`, sin framework |
| `src/providerSigning.ts` | Identidad Ed25519 persistente y firma de respuesta ligada a la solicitud |
| `src/canonicalJson.ts` | JSON canónico sobre el que se calcula la firma |
| `capability.json` | Manifiesto de capability de AIMarket Protocol v2 |
| `scripts/configureProvider.ts` | Escribe la clave pública del proveedor en el manifiesto de forma atómica |
| `scripts/validateManifest.ts` | Validación estructural fail-closed (denegar por defecto) antes de publicar |
| `test/*.test.ts` | Pruebas `node:test` de la API, la firma y el validador |
| `Dockerfile` · `.dockerignore` | Imagen en dos etapas, sin root, con volumen persistente para la clave |
| `.github/workflows/test.yml` | CI del proyecto generado |

El servicio generado **no tiene dependencias en tiempo de ejecución**: solo `node:http` y
`node:crypto`. TypeScript y `@types/node` son dependencias de desarrollo, y la imagen de ejecución
contiene JavaScript compilado con un `node_modules` vacío.

## Dos variantes, un protocolo

| | TypeScript | Python |
|---|---|---|
| Generación | `npx create-aimarket-agent my-agent` | `uvx create-aimarket-agent my-agent` |
| Servidor | `node:http` | FastAPI |
| Dependencias en ejecución | ninguna | `fastapi`, `uvicorn`, `cryptography` |
| Manifiesto | `capability.json` idéntico | `capability.json` idéntico |
| Firma | bytes idénticos | bytes idénticos |

Ambas variantes aceptan las mismas opciones (`--kind`, `--metis` / `--no-metis`, `--directory`),
aplican las mismas reglas al nombre del proyecto y emiten el mismo manifiesto. Una prueba de este
paquete genera las dos, les da la misma semilla Ed25519 y falla si difiere un solo byte del sobre
canónico o de la firma, incluidas cargas cuyo orden de claves difiere entre el orden por punto de
código de Python y el orden UTF-16 por defecto de JavaScript.

## El sobre firmado

La cabecera `X-Provider-Signature` es la firma Ed25519 en base64 sobre el JSON canónico de:

```json
{"capability_id":"my-agent.invoke@v1","input_sha256":"<sha256 of canonical input>","product_id":"my-agent","result":{"…":"…"}}
```

JSON canónico significa aquí: claves de objeto ordenadas por punto de código Unicode, sin espacios
entre tokens y caracteres no ASCII emitidos tal cual — byte a byte lo que produce
`json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)` en Python.
`input_sha256` es el resumen criptográfico (digest) SHA-256 de la entrada canónica.

Verificar una respuesta en Node:

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

La misma respuesta se verifica en Python con `cryptography` y `json.dumps(..., sort_keys=True)`.

**Mantenga enteros los números firmados.** JavaScript escribe `1.0` como `1` y Python como `1.0`;
un decimal que cruza la frontera de lenguaje dentro de un resultado firmado rompe la verificación.
Los precios y contadores del resultado deberían ser enteros (o cadenas) siempre que un verificador
en otro lenguaje pueda volver a serializarlos.

## Modelo de seguridad

- La generación es atómica: una copia o un renombrado fallido no deja un repositorio a medias, y un
  marcador de plantilla superviviente borra la salida en lugar de entregar un manifiesto roto.
- El nombre del proyecto pasa por una lista de caracteres permitidos antes de entrar en el código o
  en los archivos JSON.
- La clave del proveedor es una semilla Ed25519 de 32 bytes escrita con `O_EXCL`, `O_NOFOLLOW` y
  permisos `0600`; los enlaces simbólicos y los archivos no regulares se rechazan al escribir y al
  leer.
- La respuesta firma un sobre ligado a la solicitud con `capability_id`, `product_id`, el resumen
  criptográfico (digest) SHA-256 de la entrada y el resultado. Eso impide reutilizar la firma en otra
  solicitud.
- El servicio solo acepta la identidad de producto y de capability declarada en su manifiesto, así
  que quien llame sin ser de confianza no puede convertir la clave del proveedor en un oráculo de
  firma para otra identidad.
- Los cuerpos se rechazan por encima de 1 MiB y cuando falta o es inválido `Content-Length`, antes
  de leer la solicitud.
- El validador del manifiesto rechaza claves JSON duplicadas, claves Ed25519 malformadas, precios no
  finitos, URL inválidas y endpoints HTTP públicos antes del paso de publicación.
- La publicación nunca es automática. La garantía, la identidad del publicador, la política de
  confianza y el registro en el Hub siguen siendo acciones explícitas del operador.

## Opciones

```bash
npx create-aimarket-agent my-tool --kind tool
npx create-aimarket-agent my-data --kind data-provider
npx create-aimarket-agent my-orchestrator --kind orchestrator
npx create-aimarket-agent my-agent --no-metis
npx create-aimarket-agent my-agent --directory ./services/my-agent
```

`--metis` (por defecto) registra `"verification": {"metis": true}` en el manifiesto, lo que pide al
Hub encaminar los resultados por la verificación de Metis. `--no-metis` publica sin ella.

## Docker

```bash
docker build -t my-agent .
docker run --read-only --tmpfs /tmp -p 127.0.0.1:8080:8080 -v my-agent-key:/data my-agent
```

La imagen se ejecuta como usuario sin privilegios, tiene health check, escucha en `0.0.0.0:8080` y
guarda la clave del proveedor en `/data/provider.key`. Haga copia de seguridad de esa clave antes de
publicar: sustituirla invalida el `provider_pubkey` registrado en el Hub. Mantenga el puerto solo en
loopback hasta que un ingress HTTPS aporte tráfico de producción, concurrencia y límites de tasa; la
firma de la respuesta no autoriza a quien llama directamente.

## Publicar

```bash
npm run validate
aimarket publish capability.json --hub https://modelmarket.dev
```

La validación es solo estructural. No comprueba que la capability haga lo que el manifiesto afirma,
ni registra nada.

## Desarrollo de este generador

```bash
npm install
npm test
```

`npm test` ejecuta las pruebas del generador y la prueba de paridad entre lenguajes, que necesita
`node`, `python3` y el paquete `cryptography`. Si Python no está disponible, la prueba se omite de
forma explícita: nunca pasa en silencio.

## Licencia

MIT — véase [LICENSE](https://github.com/alexar76/create-aimarket-agent/blob/main/LICENSE).
