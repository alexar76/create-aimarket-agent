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


def test_github_readme_and_five_language_navigation_are_complete():
    for lang, path in DOCS.items():
        assert path.is_file(), lang
        text = path.read_text(encoding="utf-8")
        assert "localization-glossary.md" in text
        assert COMMAND in text
        assert "PyPI" in text
        assert "uv run create-aimarket-agent my-agent --kind tool --metis" in text
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
