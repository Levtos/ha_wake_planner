"""Wake Planner sensors."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity, SensorEntityDescription
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import UnitOfTime
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN, PersonConfig
from .coordinator import WakePlannerCoordinator

SENSOR_TYPES: tuple[SensorEntityDescription, ...] = (
    SensorEntityDescription(key="wake_state", translation_key="wake_state"),
    SensorEntityDescription(key="next_wake", translation_key="next_wake", device_class=SensorDeviceClass.TIMESTAMP),
    SensorEntityDescription(key="sleep_duration_avg", translation_key="sleep_duration_avg", native_unit_of_measurement=UnitOfTime.HOURS),
    SensorEntityDescription(key="suggested_bedtime", translation_key="suggested_bedtime", device_class=SensorDeviceClass.TIMESTAMP),
)

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    """Set up sensors for every configured person."""
    coordinator: WakePlannerCoordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities(WakePlannerSensor(coordinator, entry, person, description) for person in coordinator.persons for description in SENSOR_TYPES)

class WakePlannerSensor(CoordinatorEntity[WakePlannerCoordinator], SensorEntity):
    """A Wake Planner sensor."""

    entity_description: SensorEntityDescription
    _attr_has_entity_name = True

    def __init__(self, coordinator: WakePlannerCoordinator, entry: ConfigEntry, person: PersonConfig, description: SensorEntityDescription) -> None:
        super().__init__(coordinator)
        self.person = person
        self.entity_description = description
        self._attr_unique_id = f"{entry.entry_id}_{person.slug}_{description.key}"
        self._attr_translation_key = description.translation_key
        self._attr_device_info = {
            "identifiers": {(DOMAIN, f"{entry.entry_id}_{person.slug}")},
            "name": f"Wake Planner {person.name}",
            "manufacturer": "Wake Planner",
        }

    @property
    def native_value(self) -> str | float | datetime | None:
        """Return sensor state."""
        decision = self.coordinator.data.get(self.person.slug) if self.coordinator.data else None
        if self.entity_description.key == "wake_state":
            return decision.state.value if decision else None
        if self.entity_description.key == "next_wake":
            return self.coordinator.next_wakes.get(self.person.slug)
        if self.entity_description.key == "sleep_duration_avg":
            return self.coordinator.sleep_average_hours(self.person.slug)
        if self.entity_description.key == "suggested_bedtime":
            return self.coordinator.suggested_bedtime(self.person)
        return None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return detailed decision attributes."""
        decision = self.coordinator.data.get(self.person.slug) if self.coordinator.data else None
        if not decision:
            return {}
        attrs = decision.as_dict()
        attrs["target_sleep_hours"] = self.person.target_sleep_hours
        attrs["person_id"] = self.person.slug
        if self.entity_description.key == "sleep_duration_avg":
            attrs["sleep_log_count"] = len(self.coordinator.runtime_states.get(self.person.slug, {}).sleep_log) if self.person.slug in self.coordinator.runtime_states else 0
        return attrs
