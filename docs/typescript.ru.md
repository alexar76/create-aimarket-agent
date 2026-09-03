# create-aimarket-agent (TypeScript)

> **От пустого каталога до подписывающего поставщика AIMarket Protocol v2 — на Node, без единой рантайм-зависимости.**

<p align="center">
  <a href="https://github.com/alexar76/create-aimarket-agent/blob/main/npm/README.md">English</a> ·
  <a href="https://github.com/alexar76/create-aimarket-agent/blob/main/docs/typescript.ru.md"><b>Русский</b></a> ·
  <a href="https://github.com/alexar76/create-aimarket-agent/blob/main/docs/typescript.es.md">Español</a> ·
  <a href="https://github.com/alexar76/create-aimarket-agent/blob/main/docs/typescript.fr.md">Français</a> ·
  <a href="https://github.com/alexar76/create-aimarket-agent/blob/main/docs/typescript.zh.md">中文</a> ·
  <a href="https://github.com/alexar76/aicom/blob/main/docs/localization-glossary.md">Глоссарий локализации</a>
</p>

## Быстрый старт

```bash
npx create-aimarket-agent my-agent
cd my-agent
npm install
npm run configure
npm test
npm run dev
```

`npm run dev` поднимает `GET /health` и `POST /invoke` на `http://127.0.0.1:8080`. Каждый ответ
несёт подпись Ed25519 по конверту, привязанному к запросу: потребитель может проверить, что
результат принадлежит именно этому поставщику, этой capability и ровно этому входу.

```bash
curl -s http://127.0.0.1:8080/health
curl -si -X POST http://127.0.0.1:8080/invoke \
  -H 'content-type: application/json' \
  -d '{"input":{"hello":"world"}}' | grep -i x-provider-signature
```

## Что создаётся

| Путь | Роль |
|---|---|
| `src/agent.ts` | Сервер на `node:http` с `/health` и `/invoke`, без фреймворка |
| `src/providerSigning.ts` | Постоянная личность Ed25519 и подпись ответа, привязанная к запросу |
| `src/canonicalJson.ts` | Канонический JSON, по которому считается подпись |
| `capability.json` | Манифест capability AIMarket Protocol v2 |
| `scripts/configureProvider.ts` | Атомарно записывает публичный ключ поставщика в манифест |
| `scripts/validateManifest.ts` | Валидация структуры fail-closed (отказ по умолчанию) перед публикацией |
| `test/*.test.ts` | Тесты `node:test` на API, подпись и валидатор |
| `Dockerfile` · `.dockerignore` | Двухстадийный образ без root с томом для ключа |
| `.github/workflows/test.yml` | CI сгенерированного проекта |

У сгенерированного сервиса **нет рантайм-зависимостей** — только `node:http` и `node:crypto`.
TypeScript и `@types/node` нужны лишь для разработки, а в рантайм-образ попадает скомпилированный
JavaScript с пустым `node_modules`.

## Два варианта, один протокол

| | TypeScript | Python |
|---|---|---|
| Генерация | `npx create-aimarket-agent my-agent` | `uvx create-aimarket-agent my-agent` |
| Сервер | `node:http` | FastAPI |
| Рантайм-зависимости | нет | `fastapi`, `uvicorn`, `cryptography` |
| Манифест | идентичный `capability.json` | идентичный `capability.json` |
| Подпись | идентичные байты | идентичные байты |

Оба варианта принимают одни и те же флаги (`--kind`, `--metis` / `--no-metis`, `--directory`),
одинаково проверяют имя проекта и выдают одинаковый манифест. Тест в npm-пакете генерирует оба
проекта, выдаёт им одинаковое зерно Ed25519 и падает, если отличается хотя бы один байт
канонического конверта или подписи — включая полезные нагрузки, где порядок ключей у Python
(по кодовым точкам) расходится с порядком по умолчанию в JavaScript (по кодовым единицам UTF-16).

## Подписанный конверт

Заголовок `X-Provider-Signature` — это подпись Ed25519 в base64 по каноническому JSON от:

```json
{"capability_id":"my-agent.invoke@v1","input_sha256":"<sha256 of canonical input>","product_id":"my-agent","result":{"…":"…"}}
```

Канонический JSON здесь означает: ключи объектов отсортированы по кодовым точкам Unicode, между
токенами нет пробелов, символы вне ASCII выводятся как есть — байт в байт то, что даёт
`json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)` в Python.
`input_sha256` — это дайджест (digest) SHA-256 канонического входа.

Проверка ответа в Node:

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

Тот же ответ проверяется в Python через `cryptography` и `json.dumps(..., sort_keys=True)`.

**Держите подписываемые числа целыми.** JavaScript печатает `1.0` как `1`, а Python — как `1.0`;
дробное число, пересекающее языковую границу внутри подписанного результата, ломает проверку.
Цены и счётчики в результате лучше держать целыми (или строками), если результат может
пересериализовать верификатор на другом языке.

## Модель безопасности

- Генерация атомарна: неудачное копирование или переименование не оставляет частично созданный
  репозиторий, а уцелевший плейсхолдер шаблона удаляет результат, вместо того чтобы отдать
  сломанный манифест.
- Имя проекта проходит через список разрешённых символов до попадания в исходники и JSON.
- Ключ поставщика — 32-байтовое зерно Ed25519, записанное с `O_EXCL`, `O_NOFOLLOW` и правами
  `0600`; симлинки и нерегулярные файлы отвергаются и при записи, и при чтении.
- Ответ подписывает привязанный к запросу конверт с `capability_id`, `product_id`, дайджестом
  SHA-256 входа и результатом. Это исключает повторное использование подписи для другого запроса.
- Сервис принимает только ту личность продукта и capability, что объявлена в манифесте, поэтому
  недоверенный вызывающий не превратит ключ поставщика в оракул подписи для чужой личности.
- Тело запроса отвергается свыше 1 МиБ и при отсутствующем или некорректном `Content-Length` —
  до чтения запроса.
- Валидатор манифеста отвергает дублирующиеся ключи JSON, некорректные ключи Ed25519,
  нечисловые и бесконечные цены, битые URL и публичные HTTP-эндпоинты до шага публикации.
- Публикация никогда не происходит автоматически. Залог, личность издателя, политика доверия и
  регистрация в Hub остаются явными действиями оператора.

## Флаги

```bash
npx create-aimarket-agent my-tool --kind tool
npx create-aimarket-agent my-data --kind data-provider
npx create-aimarket-agent my-orchestrator --kind orchestrator
npx create-aimarket-agent my-agent --no-metis
npx create-aimarket-agent my-agent --directory ./services/my-agent
```

`--metis` (по умолчанию) записывает в манифест `"verification": {"metis": true}` — это просьба к
Hub проводить результаты через верификацию Metis. `--no-metis` публикует без неё.

## Docker

```bash
docker build -t my-agent .
docker run --read-only --tmpfs /tmp -p 127.0.0.1:8080:8080 -v my-agent-key:/data my-agent
```

Образ работает от непривилегированного пользователя, имеет health check, слушает `0.0.0.0:8080` и
хранит ключ поставщика в `/data/provider.key`. Сделайте резервную копию ключа до публикации: его
замена аннулирует `provider_pubkey`, зарегистрированный в Hub. Держите порт только на loopback,
пока HTTPS-ingress не обеспечит продовый трафик, конкурентность и лимиты; подпись ответа не
авторизует прямых вызывающих.

## Публикация

```bash
npm run validate
aimarket publish capability.json --hub https://modelmarket.dev
```

Валидация проверяет только структуру. Она не проверяет, что capability делает заявленное, и ничего
не регистрирует.

## Разработка самого генератора

```bash
npm install
npm test
```

`npm test` запускает тесты генератора и кросс-языковой тест паритета, которому нужны `node`,
`python3` и пакет `cryptography`. Если Python недоступен, тест пропускается явно — он никогда не
проходит молча.

## Лицензия

MIT — см. [LICENSE](https://github.com/alexar76/create-aimarket-agent/blob/main/LICENSE).
