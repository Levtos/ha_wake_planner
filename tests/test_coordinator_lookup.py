"""Regression tests for standalone coordinator discovery."""

from __future__ import annotations

import importlib.util
import sys
import types
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MODULE_DIR = ROOT / "custom_components" / "wake_planner"


def _install_ha_stubs() -> None:
    ha = sys.modules.setdefault("homeassistant", types.ModuleType("homeassistant"))
    ha.__path__ = []  # type: ignore[attr-defined]

    core = sys.modules.setdefault("homeassistant.core", types.ModuleType("homeassistant.core"))
    core.HomeAssistant = getattr(core, "HomeAssistant", object)

    config_entries = sys.modules.setdefault(
        "homeassistant.config_entries",
        types.ModuleType("homeassistant.config_entries"),
    )
    config_entries.ConfigEntry = getattr(config_entries, "ConfigEntry", object)

    helpers = sys.modules.setdefault("homeassistant.helpers", types.ModuleType("homeassistant.helpers"))
    helpers.__path__ = getattr(helpers, "__path__", [])

    update_coordinator = sys.modules.setdefault(
        "homeassistant.helpers.update_coordinator",
        types.ModuleType("homeassistant.helpers.update_coordinator"),
    )

    class _DataUpdateCoordinator:
        def __init__(self, hass, logger, name=None, update_interval=None):
            self.hass = hass
            self.logger = logger
            self.name = name
            self.update_interval = update_interval
            self.data = {}

        def __class_getitem__(cls, item):
            return cls

    update_coordinator.DataUpdateCoordinator = _DataUpdateCoordinator

    storage = sys.modules.setdefault(
        "homeassistant.helpers.storage",
        types.ModuleType("homeassistant.helpers.storage"),
    )

    class _Store:
        def __init__(self, *args, **kwargs):
            pass

    storage.Store = _Store

    util = sys.modules.setdefault("homeassistant.util", types.ModuleType("homeassistant.util"))
    util.__path__ = getattr(util, "__path__", [])
    dt = sys.modules.setdefault("homeassistant.util.dt", types.ModuleType("homeassistant.util.dt"))
    slugify = sys.modules.setdefault("homeassistant.util.slugify", types.ModuleType("homeassistant.util.slugify"))
    slugify.slugify = lambda value: str(value).lower().replace(" ", "_")


def _load_coordinator_module():
    _install_ha_stubs()
    pkg_name = "wp_lookup_pkg"
    pkg = types.ModuleType(pkg_name)
    pkg.__path__ = [str(MODULE_DIR)]
    sys.modules[pkg_name] = pkg
    for name in ("const", "storage", "calendar_cache", "calendar_source", "holiday_source", "rule_engine", "util"):
        spec = importlib.util.spec_from_file_location(
            f"{pkg_name}.{name}",
            MODULE_DIR / f"{name}.py",
        )
        mod = importlib.util.module_from_spec(spec)
        sys.modules[f"{pkg_name}.{name}"] = mod
        spec.loader.exec_module(mod)
    spec = importlib.util.spec_from_file_location(
        f"{pkg_name}.coordinator",
        MODULE_DIR / "coordinator.py",
    )
    mod = importlib.util.module_from_spec(spec)
    sys.modules[f"{pkg_name}.coordinator"] = mod
    spec.loader.exec_module(mod)
    return mod


def test_all_wake_planner_coordinators_accepts_standalone_bucket_without_module_id():
    coordinator_mod = _load_coordinator_module()
    coord = object()
    hass = types.SimpleNamespace(
        data={
            "wake_planner": {
                "entries": {
                    "entry-1": {"coordinator": coord},
                },
            },
        },
    )

    assert coordinator_mod.all_wake_planner_coordinators(hass) == [coord]
