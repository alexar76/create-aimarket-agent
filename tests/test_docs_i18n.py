from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCS = {
    "en": ROOT / "README.md",
    "ru": ROOT / "docs" / "README.ru.md",
    "es": ROOT / "docs" / "README.es.md",
    "fr": ROOT / "docs" / "README.fr.md",
    "zh": ROOT / "docs" / "README.zh.md",
}
COMMAND = "uvx create-aimarket-agent my-agent --kind tool --metis"
REFERENCE_COMMAND = (
    "uvx create-aimarket-agent themis --kind tool --metis"
)
REFERENCE_URL = "https://github.com/alexar76/themis"
TUTORIALS = {
    lang: ROOT / "docs" / "tutorials" / f"themis.{lang}.md"
    for lang in DOCS
}


def test_github_readme_and_five_language_navigation_are_complete():
    for lang, path in DOCS.items():
        assert path.is_file(), lang
        text = path.read_text(encoding="utf-8")
        assert "localization-glossary.md" in text
        assert COMMAND in text
        for token in ("capability_id", "product_id", "provider_pubkey", "Ed25519", "Hub"):
            assert token in text, (lang, token)
    root = DOCS["en"].read_text(encoding="utf-8")
    assert "<!-- aicom-readme-badges -->" in root
    assert (ROOT / ".github" / "workflows" / "ci.yml").is_file()


def test_documentation_uses_canonical_glossary_terms():
    required = {
        "ru": ("поставщик", "верификац", "залог", "дайджест"),
        "es": ("proveedor", "verificaci", "garantía", "resumen criptográfico"),
        "fr": ("fournisseur", "vérific", "caution", "empreinte"),
        "zh": ("提供方", "验证", "保证金", "摘要"),
    }
    for lang, terms in required.items():
        text = DOCS[lang].read_text(encoding="utf-8").casefold()
        assert all(term.casefold() in text for term in terms), lang


def test_reference_tutorial_is_complete_in_five_languages():
    for lang, path in TUTORIALS.items():
        assert path.is_file(), lang
        text = path.read_text(encoding="utf-8")
        for token in (
            "<!-- tutorial-contract:v1 -->",
            REFERENCE_COMMAND,
            REFERENCE_URL,
            "request_metis",
            "/verification/{",
            "uv run pytest -q",
            "docker build",
            "aimarket publish capability.json --hub https://modelmarket.dev",
            "Alien Monitor",
        ):
            assert token in text, (lang, token)
        assert REFERENCE_URL in DOCS[lang].read_text(encoding="utf-8"), lang


def test_reference_tutorial_uses_canonical_localized_terms():
    required = {
        "ru": ("агент", "поставщик", "верификац", "квитанц"),
        "es": ("agente", "proveedor", "verificaci", "recibo"),
        "fr": ("agent", "fournisseur", "vérific", "reçu"),
        "zh": ("智能体", "提供方", "验证", "收据"),
    }
    for lang, terms in required.items():
        text = TUTORIALS[lang].read_text(encoding="utf-8").casefold()
        assert all(term.casefold() in text for term in terms), lang


TYPESCRIPT_DOCS = {
    "en": ROOT / "npm" / "README.md",
    "ru": ROOT / "docs" / "typescript.ru.md",
    "es": ROOT / "docs" / "typescript.es.md",
    "fr": ROOT / "docs" / "typescript.fr.md",
    "zh": ROOT / "docs" / "typescript.zh.md",
}
NPX_COMMAND = "npx create-aimarket-agent my-agent"


def test_typescript_documentation_is_complete_in_five_languages():
    for lang, path in TYPESCRIPT_DOCS.items():
        assert path.is_file(), lang
        text = path.read_text(encoding="utf-8")
        assert "localization-glossary.md" in text, lang
        assert NPX_COMMAND in text, lang
        for token in (
            "capability_id",
            "product_id",
            "provider_pubkey",
            "Ed25519",
            "Hub",
            "X-Provider-Signature",
            "node:crypto",
            "uvx create-aimarket-agent my-agent",
        ):
            assert token in text, (lang, token)
        for sibling in TYPESCRIPT_DOCS:
            marker = "npm/README.md" if sibling == "en" else f"typescript.{sibling}.md"
            assert marker in text, (lang, sibling)


def test_typescript_documentation_uses_canonical_glossary_terms():
    required = {
        "ru": ("поставщик", "верификац", "залог", "дайджест", "подпис"),
        "es": ("proveedor", "verificaci", "garantía", "resumen criptográfico", "firma"),
        "fr": ("fournisseur", "vérific", "caution", "empreinte", "signature"),
        "zh": ("提供方", "验证", "保证金", "摘要", "签名"),
    }
    for lang, terms in required.items():
        text = TYPESCRIPT_DOCS[lang].read_text(encoding="utf-8").casefold()
        assert all(term.casefold() in text for term in terms), lang


def test_typescript_documentation_glosses_the_glossary_tokens():
    """`digest` and `fail-closed` keep the English token with one gloss."""
    expected = {
        "ru": ("дайджест (digest)", "fail-closed (отказ по умолчанию)"),
        "es": ("resumen criptográfico (digest)", "fail-closed (denegar por defecto)"),
        "fr": ("empreinte (digest)", "fail-closed (refus par défaut)"),
        "zh": ("摘要", "fail-closed（默认拒绝）"),
    }
    for lang, tokens in expected.items():
        text = TYPESCRIPT_DOCS[lang].read_text(encoding="utf-8")
        for token in tokens:
            assert token in text, (lang, token)


def test_every_readme_points_at_the_typescript_flavour():
    for lang, path in DOCS.items():
        text = path.read_text(encoding="utf-8")
        assert NPX_COMMAND in text, lang
        marker = "npm/README.md" if lang == "en" else f"typescript.{lang}.md"
        assert marker in text, lang
