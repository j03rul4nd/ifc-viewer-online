#!/usr/bin/env sh
# Validate an IFC and wait for the result. Usage: ./validate.sh Model.ifc [profile]
set -eu
: "${IFCVO_API_URL:?set IFCVO_API_URL}" "${IFCVO_API_KEY:?set IFCVO_API_KEY}"
FILE="$1"; PROFILE="${2:-}"

ID=$(curl -fsS -X POST "$IFCVO_API_URL/v1/validations" \
  -H "Authorization: Bearer $IFCVO_API_KEY" \
  -F "file=@$FILE" ${PROFILE:+-F "profile=$PROFILE"} | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')

while :; do
  BODY=$(curl -fsS "$IFCVO_API_URL/v1/validations/$ID" -H "Authorization: Bearer $IFCVO_API_KEY")
  case "$BODY" in
    *'"status":"passed"'*) echo "$BODY"; exit 0 ;;
    *'"status":"failed"'*|*'"status":"error"'*) echo "$BODY"; exit 1 ;;
  esac
  sleep 5
done
