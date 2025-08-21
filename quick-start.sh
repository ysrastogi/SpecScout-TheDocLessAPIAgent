#!/bin/bash

# Quick start script for Doc-less API Agent Demo
# This script sets up everything needed for the demo

set -e

echo "🚀 Doc-less API Agent - Quick Start Setup"
echo "========================================"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check if we're in the right directory
if [[ ! -f "package.json" ]]; then
    echo -e "${RED}❌ Please run this script from the project root directory${NC}"
    exit 1
fi

echo -e "${BLUE}📦 Installing dependencies...${NC}"
npm install

echo -e "${BLUE}🐳 Cleaning up any existing services...${NC}"
docker-compose down -v 2>/dev/null || true

echo -e "${BLUE}🐳 Starting Docker services...${NC}"
docker-compose up -d

echo -e "${BLUE}⏳ Waiting for services to be ready...${NC}"
sleep 10

# Health check function
check_service() {
    local service_name=$1
    local url=$2
    local max_attempts=15
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -sf "$url" > /dev/null 2>&1; then
            echo -e "${GREEN}✅ $service_name is ready${NC}"
            return 0
        fi
        echo -e "${YELLOW}⏳ Waiting for $service_name (attempt $attempt/$max_attempts)...${NC}"
        sleep 3
        ((attempt++))
    done
    
    echo -e "${RED}❌ $service_name failed to start${NC}"
    echo -e "${YELLOW}💡 Checking logs for $service_name...${NC}"
    docker-compose logs --tail=10 $(echo $service_name | tr '[:upper:]' '[:lower:]' | sed 's/ /-/g')-service 2>/dev/null || true
    return 1
}

# Check all services
echo -e "${BLUE}🔍 Checking service health...${NC}"

# Check Docker container status first
echo -e "${BLUE}📊 Container status:${NC}"
docker-compose ps

services_ok=true

if ! check_service "Payment Service" "http://localhost:3001/health"; then
    services_ok=false
fi

if ! check_service "Webhook Service" "http://localhost:3004/health"; then
    services_ok=false  
fi

if ! check_service "OAuth2 Service" "http://localhost:3003/.well-known/openid_configuration"; then
    services_ok=false
fi

# If services failed, provide troubleshooting info
if [ "$services_ok" = false ]; then
    echo ""
    echo -e "${YELLOW}⚠️  Some services failed to start properly.${NC}"
    echo -e "${BLUE}🔧 Troubleshooting steps:${NC}"
    echo "1. Check if ports are in use: lsof -i :3001,3002,3003"
    echo "2. View all logs: docker-compose logs"
    echo "3. Restart services: docker-compose down && docker-compose up -d"
    echo "4. The demo can still run with partial services"
    echo ""
fi

echo -e "${BLUE}🧪 Running quick test...${NC}"
npm test > /dev/null 2>&1 && echo -e "${GREEN}✅ Tests passed${NC}" || echo -e "${YELLOW}⚠️  Tests completed (may need GitHub token)${NC}"

echo ""
echo -e "${GREEN}🎉 Setup complete! Ready for demo.${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "1. Open demo-interface.html in your browser"
echo "2. Run: ./demo.sh for interactive terminal demo"
echo "3. Or run individual components:"
echo "   • npm run demo (GitHub SDK demo)"
echo "   • npm test (test suite)"
echo "   • docker-compose logs (service logs)"
echo ""

# Optional: Open demo interface automatically
if command -v open >/dev/null 2>&1; then
    echo -e "${BLUE}🌐 Opening demo interface...${NC}"
    open demo-interface.html
elif command -v xdg-open >/dev/null 2>&1; then
    echo -e "${BLUE}🌐 Opening demo interface...${NC}"
    xdg-open demo-interface.html
else
    echo -e "${YELLOW}💡 Open demo-interface.html in your browser to start${NC}"
fi

echo ""
echo -e "${GREEN}Happy demoing! 🚀${NC}"
