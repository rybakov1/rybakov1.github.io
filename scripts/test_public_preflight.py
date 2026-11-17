import importlib.util
from pathlib import Path

import pytest

SPEC = importlib.util.spec_from_file_location("public_preflight", Path(__file__).with_name("public-preflight.py"))
preflight = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(preflight)


@pytest.fixture
def valid():
    return {"SITE_DOMAIN": "shop.cenoskop.ru", "POSTGRES_PASSWORD": "a" * 64, "ADMIN_TOKEN": "b" * 64}


@pytest.mark.parametrize("flag", [None, "false", "true"])
def test_index_flag_accepts_only_explicit_boolean_values(valid, flag):
    if flag is not None:
        valid["PUBLIC_INDEXABLE"] = flag
    assert preflight.validate(valid, {}) == []
    assert any("PUBLIC_INDEXABLE" in error for error in preflight.validate({**valid, "PUBLIC_INDEXABLE": "yes"}, {}))


def test_environment_cannot_silently_override_indexing_or_credentials(valid):
    for key, value in [("PUBLIC_INDEXABLE", "true"), ("POSTGRES_PASSWORD", "other"), ("SITE_DOMAIN", "other.example")]:
        errors = preflight.validate(valid, {key: value})
        assert any(key in error for error in errors)
        assert all(value not in error for error in errors), "Values from the environment must not appear in output"


def test_template_secrets_domains_and_duplicate_keys_are_rejected(valid, tmp_path):
    for domain in ["localhost", "example.com", "test.example.com", "https://shop.test/path"]:
        assert any("SITE_DOMAIN" in error for error in preflight.validate({**valid, "SITE_DOMAIN": domain}, {}))
    assert any("POSTGRES_PASSWORD" in error for error in preflight.validate({**valid, "POSTGRES_PASSWORD": "short"}, {}))
    assert any("разными" in error for error in preflight.validate({**valid, "ADMIN_TOKEN": valid["POSTGRES_PASSWORD"]}, {}))
    path = tmp_path / "config"
    path.write_text("SITE_DOMAIN=a.example\nSITE_DOMAIN=b.example\n", encoding="utf-8")
    with pytest.raises(ValueError, match="повторная"):
        preflight.load_settings(path)
