# Multi-stage build optimized for Hugging Face Spaces
FROM node:18-slim AS node-builder

WORKDIR /app

# Copy and install Node.js dependencies first for better caching
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Production image with Python and Node.js
FROM python:3.11-slim AS production

# Install system dependencies in one layer
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Create non-root user for security (Spaces best practice)
RUN useradd --create-home --shell /bin/bash spaces
USER spaces
WORKDIR /home/spaces/app

# Copy Node.js dependencies from builder stage
COPY --from=node-builder --chown=spaces:spaces /app/node_modules ./node_modules

# Install Python dependencies
COPY --chown=spaces:spaces requirements.txt ./
RUN pip install --no-cache-dir --user -r requirements.txt

# Copy package.json for npm scripts
COPY --chown=spaces:spaces package*.json ./

# Copy application code
COPY --chown=spaces:spaces . .

# Create necessary directories with proper permissions
RUN mkdir -p logs ssl deliverables demo-sessions && \
    chmod 755 logs ssl deliverables demo-sessions

# Set environment variables for Spaces
ENV NODE_ENV=production \
    PORT=7860 \
    PYTHONPATH=/home/spaces/.local/lib/python3.11/site-packages:$PYTHONPATH \
    PATH=/home/spaces/.local/bin:$PATH \
    HUGGING_FACE_SPACES=true

# Expose Hugging Face Spaces port
EXPOSE 7860

# Health check optimized for Spaces
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:7860/health || exit 1

# Use Python wrapper as entry point (required for Spaces)
CMD ["python3", "app.py"]