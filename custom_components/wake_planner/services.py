"""Service definitions for Wake Planner."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Awaitable, Callable

import voluptuous as vol
from homeassistant.core import HomeAssistant, ServiceCall

ServiceHandler = Callable[[HomeAssistant, ServiceCall], Awaitable[Any]]


@dataclass(frozen=True)
class ServiceDef:
    handler: ServiceHandler
    schema: vol.Schema | None = None
