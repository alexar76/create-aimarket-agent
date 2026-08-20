# create-aimarket-agent

[English](../README.md) · [Русский](README.ru.md) · [Español](README.es.md) · [Français](README.fr.md) · **中文** · [术语表](https://github.com/alexar76/aicom/blob/main/docs/localization-glossary.md)

用于创建独立 AIMarket Protocol v2 提供方的生成器，包含能力清单、测试、Docker 和请求绑定的
Ed25519 签名。

## 快速开始

> **发布状态：** `create-aimarket-agent` 尚未发布到 PyPI。由于 `uvx` 默认从包注册表查找，
> 在首个版本发布前，简短命令 `uvx create-aimarket-agent ...` 会失败。

目前请从此本地源代码副本运行生成器：

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

将 `create-aimarket-agent` 发布到 PyPI 后，无需安装的命令将是：

```bash
uvx create-aimarket-agent my-agent --kind tool --metis
```

命令、flags、文件名和标识符在所有语言中保持一致。

## 生成的代码仓库

- `agent.py`：FastAPI health 和 invoke endpoints。
- `capability.json`：AIMarket Protocol v2 能力清单。
- `provider_signing.py`：提供方的持久 Ed25519 身份。
- `configure_provider.py`：以原子方式写入 `provider_pubkey`。
- `validate_manifest.py`：发布前的 fail-closed 验证。
- `test_agent.py`：API、请求绑定签名和请求大小测试。
- `Dockerfile`、`.dockerignore` 和 GitHub Actions。

## 安全模型

生成过程是原子的，失败不会留下不完整代码仓库。项目名经过 allowlist。私钥是权限为 `0600`
的 32 字节 Ed25519 seed；symlink 和非普通文件会被拒绝。签名把结果与 `capability_id`、
`product_id` 和 input 的 SHA-256 摘要绑定，阻止跨请求 replay。服务只接受清单中声明的产品和
能力身份，因此不可信调用方不能让密钥签署其他身份。验证器会拒绝重复 JSON 键、无效 Ed25519
密钥、非有限价格和公共 HTTP URL。发布不会自动进行：保证金、提供方身份、信任策略以及 Hub
注册仍是明确的运营操作。

## 项目类型

```bash
create-aimarket-agent my-tool --kind tool
create-aimarket-agent my-data --kind data-provider
create-aimarket-agent my-orchestrator --kind orchestrator
create-aimarket-agent my-agent --no-metis
```

## Docker

生成的容器以非 root 用户运行，监听 `0.0.0.0:8080`，并将密钥保存到
`/data/provider.key`，并包含 health check。发布前请备份密钥；更换密钥会使 Hub 中注册的
`provider_pubkey` 失效。在 HTTPS ingress 以及并发和频率限制就绪前，只在 loopback 上开放端口；
响应签名并不授权直接调用方。

`提供方`、`验证`、`保证金`和`摘要`遵循规范术语表。代码、命令、API 字段、env vars、品牌、
`LIVE` 和 `SIM` 保持不变。

## 许可证

MIT — 参见 [LICENSE](../LICENSE)。
