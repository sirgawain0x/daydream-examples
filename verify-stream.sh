#!/bin/bash

# Verify stream status
# Usage: ./verify-stream.sh STREAM_ID API_KEY

STREAM_ID="${1:-}"
API_KEY="${2:-}"

if [ -z "$STREAM_ID" ] || [ -z "$API_KEY" ]; then
    echo "Usage: $0 STREAM_ID API_KEY"
    echo "Example: $0 str_abc123 sk_yourkey"
    exit 1
fi

echo "Checking stream status for: $STREAM_ID"
echo ""

# Check if stream exists and get info
echo "=== Stream Info ==="
curl -s -X GET "https://api.daydream.live/v1/streams/$STREAM_ID" \
  -H "Authorization: Bearer $API_KEY" | jq '.'

echo ""
echo "=== Checking Playback ==="
# Get the playback ID from the stream
PLAYBACK_ID=$(curl -s -X GET "https://api.daydream.live/v1/streams/$STREAM_ID" \
  -H "Authorization: Bearer $API_KEY" | jq -r '.output_playback_id')

if [ "$PLAYBACK_ID" != "null" ] && [ -n "$PLAYBACK_ID" ]; then
    echo "Playback ID: $PLAYBACK_ID"
    
    # Check playback info from Livepeer
    echo ""
    echo "=== Livepeer Playback Info ==="
    curl -s "https://livepeer.studio/api/playback/$PLAYBACK_ID" | jq '.'
else
    echo "No playback ID found"
fi
