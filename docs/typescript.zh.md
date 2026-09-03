# create-aimarket-agent (TypeScript)

> **从空目录到可签名的 AIMarket Protocol v2 提供方 —— 基于 Node，零运行时依赖。**

<p align="center">
  <a href="https://github.com/alexar76/create-aimarket-agent/blob/main/npm/README.md">English</a> ·
  <a href="https://github.com/alexar76/create-aimarket-agent/blob/main/docs/typescript.ru.md">Русский</a> ·
  <a href="https://github.com/alexar76/create-aimarket-agent/blob/main/docs/typescript.es.md">Español</a> ·
  <a href="https://github.com/alexar76/create-aimarket-agent/blob/main/docs/typescript.fr.md">Français</a> ·
  <a href="https://github.com/alexar76/create-aimarket-agent/blob/main/docs/typescript.zh.md"><b>中文</b></a> ·
  <a href="https://github.com/alexar76/aicom/blob/main/docs/localization-glossary.md">本地化术语表</a>
</p>

## 快速开始

```bash
npx create-aimarket-agent my-agent
cd my-agent
npm install
npm run configure
npm test
npm run dev
```

`npm run dev` 会在 `http://127.0.0.1:8080` 上提供 `GET /health` 与 `POST /invoke`。每个响应都带有对
「与请求绑定的信封」的 Ed25519 签名，消费方据此可以验证：该结果确实来自这个提供方、这个 capability，
以及这一次确切的输入。

```bash
curl -s http://127.0.0.1:8080/health
curl -si -X POST http://127.0.0.1:8080/invoke \
  -H 'content-type: application/json' \
  -d '{"input":{"hello":"world"}}' | grep -i x-provider-signature
```

## 生成的内容

| 路径 | 作用 |
|---|---|
| `src/agent.ts` | 基于 `node:http` 的服务器，提供 `/health` 与 `/invoke`，不依赖框架 |
| `src/providerSigning.ts` | 持久化的 Ed25519 身份，以及与请求绑定的响应签名 |
| `src/canonicalJson.ts` | 计算签名所依据的规范化 JSON |
| `capability.json` | AIMarket Protocol v2 的 capability 清单 |
| `scripts/configureProvider.ts` | 原子地把提供方公钥写入清单 |
| `scripts/validateManifest.ts` | 发布前的 fail-closed（默认拒绝）结构校验 |
| `test/*.test.ts` | 覆盖 API、签名与校验器的 `node:test` 测试 |
| `Dockerfile` · `.dockerignore` | 两阶段、非 root 的镜像，密钥使用持久卷 |
| `.github/workflows/test.yml` | 生成项目的 CI |

生成的服务**没有运行时依赖**——只用 `node:http` 与 `node:crypto`。TypeScript 与 `@types/node` 仅是
开发依赖，运行镜像里是编译后的 JavaScript，`node_modules` 为空。

## 两种风味，同一套协议

| | TypeScript | Python |
|---|---|---|
| 生成 | `npx create-aimarket-agent my-agent` | `uvx create-aimarket-agent my-agent` |
| 服务器 | `node:http` | FastAPI |
| 运行时依赖 | 无 | `fastapi`、`uvicorn`、`cryptography` |
| 清单 | 完全相同的 `capability.json` | 完全相同的 `capability.json` |
| 签名 | 字节完全一致 | 字节完全一致 |

两种风味接受相同的参数（`--kind`、`--metis` / `--no-metis`、`--directory`），采用相同的项目名规则，
产出相同的清单。本包中的一个测试会同时生成两者、赋予相同的 Ed25519 种子，只要规范信封或签名有一个
字节不同就会失败——其中包括键序在 Python 的码点排序与 JavaScript 默认的 UTF-16 排序之间不一致的载荷。

## 签名信封

`X-Provider-Signature` 头是对以下内容的规范化 JSON 所做的 base64 Ed25519 签名：

```json
{"capability_id":"my-agent.invoke@v1","input_sha256":"<sha256 of canonical input>","product_id":"my-agent","result":{"…":"…"}}
```

这里的规范化 JSON 指：对象键按 Unicode 码点排序、词元之间无空白、非 ASCII 字符原样输出——与 Python 的
`json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)` 逐字节一致。
`input_sha256` 是规范化输入的 SHA-256 摘要。

在 Node 中验证响应：

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

同一个响应也能在 Python 中用 `cryptography` 与 `json.dumps(..., sort_keys=True)` 验证。

**签名中的数字请使用整数。** JavaScript 把 `1.0` 输出为 `1`，Python 输出为 `1.0`；签名结果里跨语言
传递的小数会导致验证失败。只要另一种语言的验证方可能重新序列化结果，其中的价格与计数就应保持整数
（或字符串）。

## 安全模型

- 生成过程是原子的：复制或重命名失败不会留下半成品仓库；若模板占位符残留，则删除产物，而不是交付
  一个损坏的清单。
- 项目名在进入源码或 JSON 之前先经过字符白名单校验。
- 提供方密钥是 32 字节的 Ed25519 种子，以 `O_EXCL`、`O_NOFOLLOW` 和 `0600` 权限写入；读写时都拒绝
  符号链接与非常规文件。
- 响应签名的是与请求绑定的信封，包含 `capability_id`、`product_id`、输入的 SHA-256 摘要与结果。
  这样签名无法被重放到另一次请求上。
- 服务只接受清单中声明的产品与 capability 身份，因此不可信的调用方无法把提供方密钥变成为其他身份
  服务的签名预言机。
- 请求体超过 1 MiB，或 `Content-Length` 缺失、格式错误时，在读取之前即被拒绝。
- 清单校验器在发布前拒绝重复的 JSON 键、格式错误的 Ed25519 密钥、非有限的价格、非法 URL 以及公网
  HTTP 端点。
- 发布从不自动进行。保证金、发布者身份、信任策略与 Hub 注册，始终是运营者的显式操作。

## 参数

```bash
npx create-aimarket-agent my-tool --kind tool
npx create-aimarket-agent my-data --kind data-provider
npx create-aimarket-agent my-orchestrator --kind orchestrator
npx create-aimarket-agent my-agent --no-metis
npx create-aimarket-agent my-agent --directory ./services/my-agent
```

`--metis`（默认）会在清单中写入 `"verification": {"metis": true}`，请求 Hub 把结果送入 Metis 验证。
`--no-metis` 则不带验证发布。

## Docker

```bash
docker build -t my-agent .
docker run --read-only --tmpfs /tmp -p 127.0.0.1:8080:8080 -v my-agent-key:/data my-agent
```

镜像以非特权用户运行，带有 health check，监听 `0.0.0.0:8080`，并把提供方密钥存放在
`/data/provider.key`。发布前请备份该密钥：更换密钥会使已在 Hub 注册的 `provider_pubkey` 失效。
在 HTTPS ingress 提供生产流量、并发与限流之前，请让端口只监听回环地址；响应签名并不对直接调用方
做鉴权。

## 发布

```bash
npm run validate
aimarket publish capability.json --hub https://modelmarket.dev
```

校验只针对结构。它不会检查 capability 是否真的做到清单所声称的事情，也不会注册任何东西。

## 本生成器的开发

```bash
npm install
npm test
```

`npm test` 会运行生成器自身的测试，以及跨语言的一致性（parity）测试；后者需要 `node`、`python3`
和 `cryptography` 包。若 Python 不可用，该测试会被显式跳过——绝不会悄悄通过。

## 许可证

MIT —— 见 [LICENSE](https://github.com/alexar76/create-aimarket-agent/blob/main/LICENSE)。
