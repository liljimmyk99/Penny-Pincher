#!/bin/sh
# Hourly security check (#110, docs/security.md "Alerting"). Counts the API's
# security events from the last hour and sends one notification when there
# are many failed sign-ins, or any admin action at all (only the owner is an
# admin, so an action they didn't take means the account is compromised).
#
# Run from cron on the server, as a user that can run docker:
#   0 * * * * ALERT_URL=https://ntfy.sh/<private-topic> /srv/pp/app/deploy/security-alert.sh
#
# ALERT_URL is any URL that notifies you when it receives a POST with a plain
# text body. The message holds only counts, never data from the log lines.
set -eu

: "${ALERT_URL:?set ALERT_URL to the notification URL}"
THRESHOLD="${AUTH_FAILURE_THRESHOLD:-20}"

cd "$(dirname "$0")/.."

# While the volume is locked (after a reboot) Docker isn't running; the uptime
# monitor reports that, so there is nothing to count here.
logs=$(docker compose logs --no-color --no-log-prefix --since 1h api 2>/dev/null) || exit 0

failures=$(printf '%s\n' "$logs" | grep -c '"event":"auth_failure"' || true)
actions=$(printf '%s\n' "$logs" | grep -c '"event":"admin_action"' || true)

if [ "$failures" -ge "$THRESHOLD" ] || [ "$actions" -gt 0 ]; then
	curl -fsS -m 10 -o /dev/null \
		--data "Penny-Pincher ($(hostname)): $failures failed sign-ins and $actions admin actions in the last hour. Check: docker compose logs --since 1h api | grep '\"event\"'" \
		"$ALERT_URL"
fi
