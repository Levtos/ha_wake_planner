"""Storage helper for Wake Planner."""

from __future__ import annotations

from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import storage_key

DEFAULT_VERSION = 1


def make_store(
    hass: HomeAssistant,
    module_id: str,
    suffix: str,
    *,
    version: int = DEFAULT_VERSION,
) -> Store[dict[str, Any]]:
    return Store(hass, version, storage_key(module_id, suffix))
