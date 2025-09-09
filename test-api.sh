#!/bin/bash

# Test script for Daydream API authentication
# Usage: ./test-api.sh YOUR_API_KEY

set -e

API_KEY="${1:-}"
if [ -z "$API_KEY" ]; then
    echo "Usage: $0 YOUR_API_KEY"
    echo "Example: $0 sk_1234567890abcdef"
    exit 1
fi

echo "Testing Daydream API with key: ${API_KEY:0:8}..."
echo ""

# Test 1: New schema
echo "=== Test 1: New schema ==="
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST https://api.daydream.live/v1/streams \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "pipeline_params": { "pipeline_id": "pip_qpUgXycjWF6YMeSL" },
    "name": "test",
    "output_rtmp_url": ""
  }')

HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_CODE:/d')

echo "Status: $HTTP_CODE"
echo "Response: $BODY"
echo ""

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
    echo "✅ SUCCESS! Stream created."
    echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
    exit 0
fi

# Test 2: Legacy schema
echo "=== Test 2: Legacy schema ==="
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST https://api.daydream.live/v1/streams \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "pipeline_id": "pip_qpUgXycjWF6YMeSL"
  }')

HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_CODE:/d')

echo "Status: $HTTP_CODE"
echo "Response: $BODY"
echo ""

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
    echo "✅ SUCCESS! Stream created with legacy schema."
    echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
    exit 0
fi

# Test 3: Check if it's a Livepeer Studio key
echo "=== Test 3: Testing if this is a Livepeer Studio key ==="
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X GET https://livepeer.studio/api/stream \
  -H "Authorization: Bearer $API_KEY")

HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_CODE:/d')

echo "Livepeer Studio Status: $HTTP_CODE"
if [ "$HTTP_CODE" = "200" ]; then
    echo "❌ This appears to be a Livepeer Studio key, not a Daydream key!"
    echo "You need to generate a Daydream API key from: https://app.daydream.live/beta/api-key"
    exit 1
fi

# Test 4: Try without Bearer prefix
echo "=== Test 4: Testing without Bearer prefix ==="
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST https://api.daydream.live/v1/streams \
  -H "Authorization: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "pipeline_params": { "pipeline_id": "pip_qpUgXycjWF6YMeSL" },
    "name": "test",
    "output_rtmp_url": ""
  }')

HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_CODE:/d')

echo "Status: $HTTP_CODE"
echo "Response: $BODY"
echo ""

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
    echo "✅ SUCCESS! Stream created without Bearer prefix."
    echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
    exit 0
fi

echo "❌ All tests failed. The API key appears to be invalid."
echo ""
echo "Troubleshooting steps:"
echo "1. Generate a new Daydream API key from: https://app.daydream.live/beta/api-key"
echo "2. Make sure you're using the Discord passcode to access the key generator"
echo "3. Copy the raw key (no quotes, no 'Bearer' prefix)"
echo "4. Ensure there are no hidden characters or whitespace"
echo ""
echo "Key format should look like: sk_1234567890abcdef..."
