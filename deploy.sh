#!/bin/bash

# 🚀 Quick Deploy Script for Doc-less API Agent
# Usage: ./deploy.sh [environment] [options]
# Environments: local, staging, production
# Options: --build, --no-cache, --logs, --health-check

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT=${1:-local}
BUILD_FLAG=""
COMPOSE_FILE=""
ENV_FILE=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --build)
            BUILD_FLAG="--build"
            shift
            ;;
        --no-cache)
            BUILD_FLAG="--build --no-cache"
            shift
            ;;
        --logs)
            SHOW_LOGS=true
            shift
            ;;
        --health-check)
            HEALTH_CHECK=true
            shift
            ;;
        local|staging|production)
            ENVIRONMENT=$1
            shift
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

# Set configuration based on environment
case $ENVIRONMENT in
    local)
        COMPOSE_FILE="docker-compose.yml"
        ENV_FILE=".env"
        ;;
    staging)
        COMPOSE_FILE="docker-compose.production.yml"
        ENV_FILE=".env.staging"
        ;;
    production)
        COMPOSE_FILE="docker-compose.production.yml"
        ENV_FILE=".env.production"
        ;;
    *)
        echo -e "${RED}Invalid environment: $ENVIRONMENT${NC}"
        echo "Valid environments: local, staging, production"
        exit 1
        ;;
esac

# Functions
print_header() {
    echo -e "${CYAN}"
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║                🚀 DOC-LESS API AGENT DEPLOY 🚀                ║"
    echo "║                                                                ║"
    echo "║    Environment: $ENVIRONMENT"
    echo "║    Compose File: $COMPOSE_FILE"
    echo "║    Environment File: $ENV_FILE"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

check_prerequisites() {
    echo -e "${BLUE}🔧 Checking prerequisites...${NC}"
    
    # Check if Docker is installed and running
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}❌ Docker not found. Please install Docker first.${NC}"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        echo -e "${RED}❌ Docker is not running. Please start Docker first.${NC}"
        exit 1
    fi
    
    # Check if docker-compose is available
    if ! command -v docker-compose &> /dev/null; then
        echo -e "${RED}❌ docker-compose not found. Please install docker-compose.${NC}"
        exit 1
    fi
    
    # Check if compose file exists
    if [[ ! -f $COMPOSE_FILE ]]; then
        echo -e "${RED}❌ Compose file not found: $COMPOSE_FILE${NC}"
        exit 1
    fi
    
    # Check if environment file exists
    if [[ ! -f $ENV_FILE ]]; then
        echo -e "${YELLOW}⚠️  Environment file not found: $ENV_FILE${NC}"
        echo -e "${YELLOW}   Using default values or environment variables.${NC}"
    fi
    
    echo -e "${GREEN}✅ Prerequisites check complete${NC}"
}

create_directories() {
    echo -e "${BLUE}📁 Creating required directories...${NC}"
    mkdir -p logs
    mkdir -p ssl
    mkdir -p monitoring/prometheus
    mkdir -p monitoring/grafana/provisioning
    mkdir -p deliverables
    echo -e "${GREEN}✅ Directories created${NC}"
}

generate_ssl_certs() {
    if [[ ! -f ssl/cert.pem ]] || [[ ! -f ssl/key.pem ]]; then
        echo -e "${BLUE}🔒 Generating self-signed SSL certificates...${NC}"
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout ssl/key.pem \
            -out ssl/cert.pem \
            -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"
        echo -e "${GREEN}✅ SSL certificates generated${NC}"
    else
        echo -e "${GREEN}✅ SSL certificates already exist${NC}"
    fi
}

stop_services() {
    echo -e "${BLUE}🛑 Stopping existing services...${NC}"
    docker-compose -f $COMPOSE_FILE down --remove-orphans 2>/dev/null || true
    echo -e "${GREEN}✅ Services stopped${NC}"
}

start_services() {
    echo -e "${BLUE}🚀 Starting services...${NC}"
    
    if [[ -f $ENV_FILE ]]; then
        docker-compose -f $COMPOSE_FILE --env-file $ENV_FILE up -d $BUILD_FLAG
    else
        docker-compose -f $COMPOSE_FILE up -d $BUILD_FLAG
    fi
    
    echo -e "${GREEN}✅ Services started${NC}"
}

wait_for_services() {
    echo -e "${BLUE}⏳ Waiting for services to be ready...${NC}"
    
    # Different services based on environment
    if [[ $ENVIRONMENT == "local" ]]; then
        # For local development, only check mock lab services
        local services=(
            "http://localhost:3001/health|Payment Service"
            "http://localhost:3003/.well-known/openid_configuration|OAuth2 Service"
            "http://localhost:3004/health|Webhook Service"
        )
    else
        # For staging/production, check all services including API agent
        local services=(
            "http://localhost:3000/health|API Agent"
            "http://localhost:3001/health|Payment Service"
            "http://localhost:3003/.well-known/openid_configuration|OAuth2 Service"
            "http://localhost:3004/health|Webhook Service"
        )
    fi
    
    for service_entry in "${services[@]}"; do
        IFS='|' read -r url name <<< "$service_entry"
        echo -n "  Waiting for $name... "
        
        retry_count=0
        max_retries=30
        
        while ! curl -sf "$url" >/dev/null 2>&1; do
            if [[ $retry_count -ge $max_retries ]]; then
                echo -e "${RED}❌ TIMEOUT${NC}"
                echo -e "${YELLOW}   Note: $name may not be available in $ENVIRONMENT mode${NC}"
                # Don't fail for local development if service isn't available
                if [[ $ENVIRONMENT == "local" ]]; then
                    echo -e "${YELLOW}   ⚠️  Continuing anyway (local development)${NC}"
                    break
                else
                    return 1
                fi
            fi
            sleep 2
            ((retry_count++))
        done
        
        if [[ $retry_count -lt $max_retries ]]; then
            echo -e "${GREEN}✅ Ready${NC}"
        fi
    done
    
    echo -e "${GREEN}✅ Service check complete${NC}"
}

health_check() {
    if [[ $HEALTH_CHECK == true ]]; then
        echo -e "${BLUE}🏥 Running health checks...${NC}"
        
        # API Health Check (only for production/staging)
        if [[ $ENVIRONMENT != "local" ]]; then
            api_health=$(curl -sf http://localhost:3000/health || echo "failed")
            if [[ $api_health == "failed" ]]; then
                echo -e "${RED}❌ API health check failed${NC}"
                return 1
            fi
        fi
        
        # Database Check (if using postgres)
        if docker-compose -f $COMPOSE_FILE ps | grep -q postgres; then
            db_health=$(docker-compose -f $COMPOSE_FILE exec -T postgres pg_isready -q && echo "ok" || echo "failed")
            if [[ $db_health == "failed" ]]; then
                echo -e "${RED}❌ Database health check failed${NC}"
                return 1
            fi
        fi
        
        # Redis Check (if using redis)
        if docker-compose -f $COMPOSE_FILE ps | grep -q redis; then
            redis_health=$(docker-compose -f $COMPOSE_FILE exec -T redis redis-cli ping | grep -q PONG && echo "ok" || echo "failed")
            if [[ $redis_health == "failed" ]]; then
                echo -e "${RED}❌ Redis health check failed${NC}"
                return 1
            fi
        fi
        
        echo -e "${GREEN}✅ All health checks passed${NC}"
    fi
}

show_logs() {
    if [[ $SHOW_LOGS == true ]]; then
        echo -e "${BLUE}📋 Showing logs...${NC}"
        docker-compose -f $COMPOSE_FILE logs -f --tail=50
    fi
}

display_access_info() {
    echo -e "${CYAN}"
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║                    🎉 DEPLOYMENT COMPLETE 🎉                  ║"
    echo "║                                                                ║"
    echo "║  Demo Interface Access:                                        ║"
    echo "║  • Main Interface:    http://localhost                        ║"
    echo "║  • Demo Interface:    http://localhost/demo-interface.html    ║"
    echo "║  • Direct Python:     http://localhost:8080                   ║"
    echo "║  • Express Server:    http://localhost:3000                   ║"
    echo "║                                                                ║"
    echo "║  API & Services:                                               ║"
    echo "║  • API Endpoint:      http://localhost:3000/api               ║"
    echo "║  • Health Check:      http://localhost:3000/health            ║"
    echo "║  • Mock OAuth2:       http://localhost:3003                   ║"
    echo "║  • Mock Payment:      http://localhost:3001                   ║"
    echo "║  • Mock Webhook:      http://localhost:3004                   ║"
    if docker-compose -f $COMPOSE_FILE ps | grep -q grafana; then
        echo "║  • Grafana:           http://localhost:3001 (admin/admin)     ║"
    fi
    if docker-compose -f $COMPOSE_FILE ps | grep -q prometheus; then
        echo "║  • Prometheus:        http://localhost:9090                   ║"
    fi
    echo "║                                                                ║"
    echo "║  Serving Commands:                                             ║"
    echo "║  • npm run serve      # Express server (recommended)          ║"
    echo "║  • npm run serve:demo # Python simple server                  ║"
    echo "║  • ./deploy.sh        # Full Docker stack with Nginx          ║"
    echo "║                                                                ║"
    echo "║  Useful Commands:                                              ║"
    echo "║  • View logs:         docker-compose -f $COMPOSE_FILE logs -f     ║"
    echo "║  • Stop services:     docker-compose -f $COMPOSE_FILE down        ║"
    echo "║  • Run demo:          ./demo.sh                               ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

cleanup() {
    if [[ $? -ne 0 ]]; then
        echo -e "${RED}❌ Deployment failed. Cleaning up...${NC}"
        docker-compose -f $COMPOSE_FILE down --remove-orphans 2>/dev/null || true
    fi
}

# Main execution
trap cleanup EXIT

print_header
check_prerequisites
create_directories

if [[ $ENVIRONMENT != "local" ]]; then
    generate_ssl_certs
fi

stop_services
start_services
wait_for_services
health_check
display_access_info
show_logs
