#!/usr/bin/env bash
# Jednorázové naplnění dat po migraci 0004:
#   1) výchozí snímek katalogu Netflixu v ČR (filmy i seriály),
#   2) historie české Top 10 od roku 2021 do archivu.
# Další běhy obstará cron (workers/cron.js), skript jde ale pustit kdykoli znovu.
#
# Použití: ADMIN_API_KEY=... ./scripts/backfill-netflix-data.sh [https://www.topflix.cz]
set -euo pipefail

BASE="${1:-https://www.topflix.cz}"
: "${ADMIN_API_KEY:?Nastavte ADMIN_API_KEY}"

post() {
  curl -fsS -X POST -H "Authorization: Bearer ${ADMIN_API_KEY}" "${BASE}$1"
}

field() {
  python3 -c "import json,sys; print(json.load(sys.stdin).get('$1'))"
}

for type in movie series; do
  echo "Katalog: ${type}"
  for _ in $(seq 1 30); do
    state="$(post "/api/netflix-catalog-sync?type=${type}&pages=40")"
    echo "  ${state}" | cut -c1-200
    [ "$(echo "${state}" | field done)" = "True" ] && break
  done
done

echo "Historie Top 10: načítám týdny"
post "/api/top10-history-sync?action=load"; echo

echo "Historie Top 10: párování"
for _ in $(seq 1 100); do
  result="$(post "/api/top10-history-sync?action=map&limit=25")"
  echo "  ${result}"
  [ "$(echo "${result}" | field remaining)" = "0" ] && break
done

echo "Netflix ID z Wikidat (přímé odkazy Pustit)"
for _ in $(seq 1 60); do
  result="$(post "/api/netflix-ids-sync?limit=300")"
  echo "  ${result}"
  [ "$(echo "${result}" | field remaining)" = "0" ] && break
done

echo "Chybně napárované řádky z dřívějška (nic se nemaže):"
post "/api/top10-history-sync?action=mismatches" | cut -c1-2000; echo
echo "Smazat je: curl -X POST -H 'Authorization: Bearer …' '${BASE}/api/top10-history-sync?action=cleanup&confirm=1'"
