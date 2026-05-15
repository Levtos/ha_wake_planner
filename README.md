# Wake Planner

A Home Assistant custom integration for managing wake-up alarms with weekly profiles, calendar integration, and sleep tracking.

## Kalenderquellen

### Home-Assistant-Kalender (empfohlen)
Kalender die bereits in Home Assistant eingebunden sind (Google Calendar,
Apple iCloud, Nextcloud, etc.) können direkt als Quelle ausgewählt werden.

### CalDAV (fortgeschritten)
Falls ein Kalender noch nicht als HA-Integration eingebunden ist, kann
CalDAV direkt konfiguriert werden. Dies erfordert manuelles Eintragen der
Zugangsdaten in der Integration nach der Einrichtung.
CalDAV-Felder: `caldav_url`, `caldav_username`, `caldav_password`
