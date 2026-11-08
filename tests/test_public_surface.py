"""The plugin delegates model persistence rather than bypassing native consent."""
import ast
import importlib.util
from pathlib import Path
from fastapi import FastAPI
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]


def test_no_plugin_model_mutation_route_or_adapter():
    assert not (ROOT / "dashboard/model_settings.py").exists()
    spec = importlib.util.spec_from_file_location("public_surface_api", ROOT / "dashboard/plugin_api.py")
    assert spec is not None and spec.loader is not None
    api = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(api)
    app = FastAPI()
    app.include_router(api.router)
    with TestClient(app) as client:
        assert client.get("/correction-model").status_code == 404
        assert client.post("/correction-model", json={"model": "synthetic"}).status_code == 404


def test_runtime_imports_use_only_the_intended_public_hermes_surfaces():
    for path in [ROOT / "__init__.py", *(ROOT / "dashboard").glob("*.py")]:
        tree = ast.parse(path.read_text(encoding="utf-8-sig"))
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and node.module and node.module.split(".")[0] in {"agent", "hermes_cli", "hermes_constants", "tools", "providers"}:
                assert node.module in {"hermes_constants", "hermes_cli.config"}, (path.name, node.module)
                assert all(not alias.name.startswith("_") for alias in node.names)
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
                assert node.func.id not in {"save_config", "save_config_value", "set_model_assignment", "persist_model_selection"}
