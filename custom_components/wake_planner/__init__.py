"""Wake Planner integration."""

from __future__ import annotations

from pathlib import Path
import logging

from homeassistant.components import frontend
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant

from .const import DOMAIN, PLATFORMS
from .coordinator import WakePlannerCoordinator
from .services import async_setup_services

_LOGGER = logging.getLogger(__name__)

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Wake Planner from a config entry."""
    hass.data.setdefault(DOMAIN, {})
    coordinator = WakePlannerCoordinator(hass, entry)
    await coordinator.async_load()
    await coordinator.async_config_entry_first_refresh()
    hass.data[DOMAIN][entry.entry_id] = coordinator

    await hass.config_entries.async_forward_entry_setups(entry, [Platform.SENSOR, Platform.BINARY_SENSOR])
    async_setup_services(hass)
    await _async_register_panel(hass)
    entry.async_on_unload(entry.add_update_listener(async_update_options))
    return True

async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload Wake Planner."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, [Platform.SENSOR, Platform.BINARY_SENSOR])
    if unload_ok:
        hass.data.get(DOMAIN, {}).pop(entry.entry_id, None)
        if not hass.data.get(DOMAIN):
            hass.services.async_remove(DOMAIN, "skip_next")
            hass.services.async_remove(DOMAIN, "set_override")
            hass.services.async_remove(DOMAIN, "clear_override")
            hass.services.async_remove(DOMAIN, "log_sleep")
    return unload_ok

async def async_update_options(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Reload entry after options changes."""
    await hass.config_entries.async_reload(entry.entry_id)

async def _async_register_panel(hass: HomeAssistant) -> None:
    """Serve and register the Wake Planner custom panel."""
    if "wake-planner" in hass.data.get("frontend_panels", {}):
        return
    frontend_dir = Path(__file__).parent / "frontend"
    await hass.http.async_register_static_paths([
        frontend.StaticPathConfig("/wake_planner/frontend", str(frontend_dir), cache_headers=False)
    ])
    frontend.async_register_built_in_panel(
        hass,
        component_name="custom",
        sidebar_title="Wake Planner",
        sidebar_icon="mdi:alarm-check",
        frontend_url_path="wake-planner",
        require_admin=False,
        config={
            "_panel_custom": {
                "name": "wake-planner-panel",
                "embed_iframe": True,
                "js_url": "/wake_planner/frontend/wake-planner-panel.js",
            }
        },
    )
