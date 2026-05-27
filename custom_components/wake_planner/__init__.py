"""Wake Planner standalone Home Assistant integration."""

from __future__ import annotations

import logging

from homeassistant.components import websocket_api
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EVENT_HOMEASSISTANT_STARTED, Platform
from homeassistant.core import HomeAssistant, ServiceCall, callback
from homeassistant.helpers.typing import ConfigType

from .const import DATA_ENTRIES, DATA_SERVICES_REGISTERED, DOMAIN, service_name
from .coordinator import WakePlannerCoordinator
from .panel import async_register_panel
from .services_impl import SERVICES
from .websockets_impl import WEBSOCKETS

_LOGGER = logging.getLogger(__name__)

PLATFORMS: tuple[Platform, ...] = (Platform.SENSOR, Platform.BINARY_SENSOR)


async def async_setup(hass: HomeAssistant, _config: ConfigType) -> bool:
    """Register integration-wide services and WebSocket commands."""
    data = hass.data.setdefault(
        DOMAIN,
        {DATA_ENTRIES: {}, DATA_SERVICES_REGISTERED: False},
    )
    if data[DATA_SERVICES_REGISTERED]:
        return True

    for action, sdef in SERVICES.items():
        full = service_name(DOMAIN, action)
        if hass.services.has_service(DOMAIN, full):
            continue

        async def _handle(call: ServiceCall, _handler=sdef.handler) -> None:
            await _handler(hass, call)

        hass.services.async_register(DOMAIN, full, _handle, schema=sdef.schema)

    for ws_command in WEBSOCKETS:
        websocket_api.async_register_command(hass, ws_command)

    data[DATA_SERVICES_REGISTERED] = True
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up a Wake Planner config entry."""
    hass.data.setdefault(DOMAIN, {DATA_ENTRIES: {}, DATA_SERVICES_REGISTERED: False})
    bucket = hass.data[DOMAIN][DATA_ENTRIES].setdefault(entry.entry_id, {})

    coordinator = WakePlannerCoordinator(hass, entry)
    await coordinator.async_load()
    bucket["coordinator"] = coordinator

    if hass.is_running:
        await coordinator.async_config_entry_first_refresh()
    else:

        @callback
        def _async_refresh_after_started(_event) -> None:
            hass.async_create_task(coordinator.async_request_refresh())

        bucket["wake_planner_startup_unsub"] = hass.bus.async_listen_once(
            EVENT_HOMEASSISTANT_STARTED,
            _async_refresh_after_started,
        )

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    try:
        await async_register_panel(hass)
    except Exception as err:  # noqa: BLE001
        _LOGGER.warning("wake_planner panel registration failed: %s", err)

    entry.async_on_unload(entry.add_update_listener(_async_reload_on_options))
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a Wake Planner config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if not unload_ok:
        return False

    bucket = hass.data.get(DOMAIN, {}).get(DATA_ENTRIES, {}).pop(entry.entry_id, {})
    unsub = bucket.pop("wake_planner_startup_unsub", None)
    if unsub:
        unsub()
    bucket.pop("coordinator", None)
    return True


async def _async_reload_on_options(hass: HomeAssistant, entry: ConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)
