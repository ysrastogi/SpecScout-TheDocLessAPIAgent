#!/bin/bash

# Deploy to Hugging Face Spaces script
# Usage: ./deploy-to-spaces.sh

set -e

echo "🚀 Deploying Doc-less API Agent to Hugging Face Spaces"

# Check if we're in the right directory
if [ ! -f "app.py" ] || [ ! -f "server.js" ]; then
    echo "❌ Error: This script must be run from the project root directory"
    exit 1
fi

# Check for required files
echo "📋 Checking required files..."
required_files=("app.py" "server.js" "Dockerfile" "requirements.txt" "package.json" "demo-interface.html" "README_SPACES.md")

for file in "${required_files[@]}"; do
    if [ ! -f "$file" ]; then
        echo "❌ Missing required file: $file"
        exit 1
    fi
    echo "✅ Found: $file"
done

# Validate Dockerfile
echo "🐳 Validating Dockerfile..."
if ! grep -q "EXPOSE 7860" Dockerfile; then
    echo "❌ Dockerfile must expose port 7860 for Spaces"
    exit 1
fi

if ! grep -q "CMD.*app.py" Dockerfile; then
    echo "❌ Dockerfile must use app.py as entry point"
    exit 1
fi

echo "✅ Dockerfile validation passed"

# Validate README_SPACES.md
echo "📄 Validating README_SPACES.md..."
if ! grep -q "app_port: 7860" README_SPACES.md; then
    echo "❌ README_SPACES.md must specify app_port: 7860"
    exit 1
fi

if ! grep -q "sdk: docker" README_SPACES.md; then
    echo "❌ README_SPACES.md must specify sdk: docker"
    exit 1
fi

echo "✅ README_SPACES.md validation passed"

# Test local build (optional)
echo "🧪 Testing local Docker build (optional)..."
read -p "Do you want to test the Docker build locally? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🔨 Building Docker image locally..."
    docker build -t docless-api-agent-test .
    
    echo "🧪 Testing container startup..."
    docker run --rm -d --name docless-test -p 7860:7860 \
        -e HUGGING_FACE_SPACES=true \
        docless-api-agent-test
    
    # Wait a bit for startup
    sleep 10
    
    # Test health endpoint
    if curl -f http://localhost:7860/health > /dev/null 2>&1; then
        echo "✅ Local test passed - health endpoint responding"
    else
        echo "⚠️ Local test failed - health endpoint not responding"
    fi
    
    # Test main page
    if curl -f http://localhost:7860/ > /dev/null 2>&1; then
        echo "✅ Local test passed - main page responding"
    else
        echo "⚠️ Local test failed - main page not responding"
    fi
    
    # Cleanup
    docker stop docless-test || true
    docker rmi docless-api-agent-test || true
    
    echo "🧹 Local test cleanup completed"
fi

echo ""
echo "🎉 Pre-deployment checks completed successfully!"
echo ""
echo "📝 Next steps:"
echo "1. Commit all changes to your Git repository"
echo "2. Push to the main branch connected to your Hugging Face Space"
echo "3. Monitor the Space logs during deployment"
echo ""
echo "🔗 Useful commands:"
echo "   git add -A"
echo "   git commit -m 'Deploy to Spaces'"
echo "   git push origin main"
echo ""
echo "🌐 Your Space should be available at:"
echo "   https://huggingface.co/spaces/[your-username]/[space-name]"
echo ""
echo "🔍 Debug endpoints once deployed:"
echo "   /health - Health check"
echo "   /test - Simple test endpoint"
echo "   /spaces/info - Space information"
echo ""
