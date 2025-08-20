#!/bin/bash

echo "🎬 Doc-less API Agent Demo"
echo "=========================="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

demo_step() {
    echo -e "${BLUE}🔹 $1${NC}"
    echo "Press Enter to continue..."
    read
}

demo_step "1. Check all services are running"
docker-compose ps

demo_step "2. Test Payment Service - Create Payment with Idempotency"
IDEMPOTENCY_KEY="demo-$(date +%s)"
echo "Using Idempotency Key: $IDEMPOTENCY_KEY"

PAYMENT_RESPONSE=$(curl -s -X POST http://localhost:3001/payments \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -d '{
    "amount": 2500,
    "currency": "usd",
    "payment_method": "card",
    "description": "Demo payment for API Agent showcase"
  }')

echo -e "${GREEN}Payment Response:${NC}"
echo "$PAYMENT_RESPONSE" | jq .

# Extract payment ID for later use
PAYMENT_ID=$(echo "$PAYMENT_RESPONSE" | jq -r '.id // empty')

demo_step "3. Test Idempotency - Repeat same request"
echo "Making identical request with same Idempotency-Key..."

REPEAT_RESPONSE=$(curl -s -X POST http://localhost:3001/payments \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -d '{
    "amount": 2500,
    "currency": "usd", 
    "payment_method": "card",
    "description": "Demo payment for API Agent showcase"
  }')

echo -e "${GREEN}Repeat Response (should be identical):${NC}"
echo "$REPEAT_RESPONSE" | jq .

demo_step "4. Test Webhook Service - Generate HMAC Signature"
WEBHOOK_PAYLOAD='{"event": "payment.created", "data": {"id": "'$PAYMENT_ID'", "amount": 2500, "status": "succeeded"}}'

SIGNATURE_RESPONSE=$(curl -s -X POST http://localhost:3002/generate-signature \
  -H "Content-Type: application/json" \
  -d "$WEBHOOK_PAYLOAD")

echo -e "${GREEN}Signature Response:${NC}"
echo "$SIGNATURE_RESPONSE" | jq .

# Extract signature for webhook call
SIGNATURE=$(echo "$SIGNATURE_RESPONSE" | jq -r '.signature')

demo_step "5. Test Webhook with HMAC Verification"
echo "Sending webhook with signature: $SIGNATURE"

WEBHOOK_RESPONSE=$(curl -s -X POST http://localhost:3002/webhook \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: $SIGNATURE" \
  -d "$WEBHOOK_PAYLOAD")

echo -e "${GREEN}Webhook Response:${NC}"
echo "$WEBHOOK_RESPONSE" | jq .

demo_step "6. Test OAuth2 Service - Check Configuration"
OAUTH_CONFIG=$(curl -s http://localhost:3003/.well-known/openid_configuration)

echo -e "${GREEN}OAuth2 Configuration:${NC}"
echo "$OAUTH_CONFIG" | jq '{
  issuer,
  authorization_endpoint,
  token_endpoint,
  userinfo_endpoint,
  code_challenge_methods_supported
}'

demo_step "7. Test GitHub SDK (TypeScript)"
echo "Running SDK demo..."
npm run demo

demo_step "8. Run Test Suite"
echo "Running comprehensive test suite..."
npm test

echo ""
echo -e "${GREEN}🎉 Demo Complete!${NC}"
echo ""
echo -e "${YELLOW}Key Features Demonstrated:${NC}"
echo "✅ Idempotency Key handling"
echo "✅ HMAC signature verification"
echo "✅ OAuth2 PKCE flow setup"
echo "✅ TypeScript SDK with pagination"
echo "✅ Retry logic with exponential backoff"
echo "✅ Comprehensive test coverage"
echo ""
echo -e "${BLUE}Next Steps:${NC}"
echo "• Check Postman collection: postman_collection.json"
echo "• Review OpenAPI spec: openapi.yaml"
echo "• Explore evidence documentation: evidence.md"
echo "• Scale with Docker Swarm or Kubernetes"