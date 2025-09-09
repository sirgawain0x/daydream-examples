#!/bin/bash

# Test Daydream API stream creation
# Usage: ./test-daydream-api.sh YOUR_API_KEY

set -e

API_KEY="${1:-}"
if [ -z "$API_KEY" ]; then
    echo "Usage: $0 YOUR_API_KEY"
    exit 1
fi

echo "Testing Daydream API..."
echo ""

# Test stream creation
echo "=== Creating Stream ==="
RESPONSE=$(curl -s -X POST https://api.daydream.live/v1/streams \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "pipeline_params": {
      "pipeline_id": "pip_qpUgXycjWF6YMeSL"
    },
    "name": "Test Stream",
    "output_rtmp_url": ""
  }')

echo "Response:"
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"

# Extract stream ID
STREAM_ID=$(echo "$RESPONSE" | jq -r '.id' 2>/dev/null || echo "")

if [ -z "$STREAM_ID" ] || [ "$STREAM_ID" = "null" ]; then
    echo ""
    echo "❌ Failed to create stream"
    exit 1
fi

echo ""
echo "✅ Stream created successfully!"
echo "Stream ID: $STREAM_ID"
echo "Playback ID: $(echo "$RESPONSE" | jq -r '.output_playback_id')"
echo "WHIP URL: $(echo "$RESPONSE" | jq -r '.whip_url')"

# Wait a moment
echo ""
echo "Waiting 5 seconds..."
sleep 5

# Try to send a prompt
echo ""
echo "=== Sending Test Prompt ==="
PROMPT_RESPONSE=$(curl -s -X POST "https://api.daydream.live/beta/streams/$STREAM_ID/prompts" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model_id": "streamdiffusion",
    "pipeline": "live-video-to-video",
    "params": {
      "model_id": "stabilityai/sd-turbo",
      "prompt": "test prompt",
      "prompt_interpolation_method": "slerp",
      "normalize_prompt_weights": true,
      "normalize_seed_weights": true,
      "negative_prompt": "blurry",
      "num_inference_steps": 50,
      "seed": 42,
      "t_index_list": [0, 8, 17],
      "controlnets": []
    }
  }')

echo "Prompt Response:"
echo "$PROMPT_RESPONSE" | jq '.' 2>/dev/null || echo "$PROMPT_RESPONSE"

echo ""
echo "=== Test Complete ==="
echo "If you see 'Stream not ready yet', that's normal - the stream needs video input first."
