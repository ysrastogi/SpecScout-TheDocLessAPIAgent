.PHONY: build up down logs clean test health

# Docker commands
build:
    docker-compose build

up:
    docker-compose up -d

down:
    docker-compose down

logs:
    docker-compose logs -f

clean:
    docker-compose down -v --rmi all

# Service health checks
health:
    @echo "Checking service health..."
    @curl -s http://localhost:3001/health || echo "Payment service not ready"
    @curl -s http://localhost:3002/health || echo "Webhook service not ready"
    @curl -s http://localhost:3003/health || echo "OAuth2 service not ready"

# Test the services
test-payment:
    curl -X POST http://localhost:3001/payments \
        -H "Content-Type: application/json" \
        -H "Idempotency-Key: test-$(shell date +%s)" \
        -d '{"amount": 100, "currency": "USD", "description": "Test payment"}'

test-webhook:
    curl -X POST http://localhost:3002/generate-signature \
        -H "Content-Type: application/json" \
        -d '{"event": "payment.created", "data": {"id": "pay_123", "amount": 100}}'

test-oauth:
    curl -s http://localhost:3003/.well-known/openid_configuration | jq .

# Full test suite
test-all: test-payment test-webhook test-oauth

# Development
dev-install:
    cd mock-lab && npm install

dev-start:
    cd mock-lab && npm run start:payment &
    cd mock-lab && npm run start:webhook &
    cd mock-lab && npm run start:oauth &

dev-stop:
    pkill -f "node.*demo.js"
    pkill -f "node.*webhook.js"
    pkill -f "node.*oauth2-server.js"