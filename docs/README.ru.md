# create-aimarket-agent

[English](../README.md) · **Русский** · [Español](README.es.md) · [Français](README.fr.md) · [中文](README.zh.md) · [Глоссарий](https://github.com/alexar76/aicom/blob/main/docs/localization-glossary.md)

Генератор автономного поставщика AIMarket Protocol v2 с манифестом capability, тестами, Docker и
request-bound подписью Ed25519.

## Быстрый старт

> **Статус дистрибутива:** `create-aimarket-agent` пока не опубликован в PyPI. `uvx` по умолчанию
> ищет пакет в реестре, поэтому короткая команда `uvx create-aimarket-agent ...` не заработает до
> публикации первого релиза.

Сейчас запускайте генератор из этой локальной копии исходников:

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

После публикации `create-aimarket-agent` в PyPI команда без установки будет такой:

```bash
uvx create-aimarket-agent my-agent --kind tool --metis
```

Команды, флаги, имена файлов и идентификаторы одинаковы на всех языках.

## Что создаётся

- `agent.py` — health и invoke endpoints FastAPI.
- `capability.json` — манифест capability AIMarket Protocol v2.
- `provider_signing.py` — постоянная Ed25519-идентичность поставщика.
- `configure_provider.py` — атомарно записывает `provider_pubkey` в манифест.
- `validate_manifest.py` — fail-closed проверка перед публикацией.
- `test_agent.py` — тест API, request-bound подписи и лимита запроса.
- `Dockerfile`, `.dockerignore` и GitHub Actions.

## Безопасность

Генерация атомарна: ошибка не оставляет частичный репозиторий. Имя проекта проходит allowlist.
Закрытый ключ — 32-байтовый Ed25519 seed с правами `0600`; symlink и не-обычные файлы отклоняются.
Подпись связывает результат с `capability_id`, `product_id` и SHA-256-дайджестом input, защищая от
replay между запросами. Сервис принимает только идентичность продукта и capability из манифеста:
недоверенный вызывающий не может заставить ключ подписать другую идентичность. Валидатор отклоняет
повторяющиеся JSON-ключи, неверный Ed25519-ключ, нечисловую цену и публичный HTTP URL. Публикация не
автоматизируется: залог, идентичность поставщика, политика доверия и регистрация в Hub остаются
явными действиями оператора.

## Варианты проекта

```bash
create-aimarket-agent my-tool --kind tool
create-aimarket-agent my-data --kind data-provider
create-aimarket-agent my-orchestrator --kind orchestrator
create-aimarket-agent my-agent --no-metis
```

## Docker

Сгенерированный контейнер работает без root, слушает `0.0.0.0:8080` и хранит ключ в
`/data/provider.key` и имеет health check. Сделайте резервную копию ключа до публикации: его замена
нарушит соответствие с `provider_pubkey`, зарегистрированным в Hub. До настройки HTTPS ingress,
лимитов параллельности и частоты оставляйте порт доступным только локально: подпись ответа не
авторизует прямого вызывающего.

Термины `поставщик`, `верификация`, `залог`, `дайджест` и другие согласованы с глоссарием. Код,
команды, API-поля, env vars, бренды, `LIVE` и `SIM` не переводятся.

## Лицензия

MIT — см. [LICENSE](../LICENSE).
