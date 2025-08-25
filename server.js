#!/usr/bin/env node

const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs').promises;
const DemoStreamingService = require('./demo-streaming');
const SpacesStorageManager = require('./storage-manager');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_SPACES = process.env.IS_SPACES === 'true';
const WORKSPACE_DIR = process.env.WORKSPACE_DIR || './demo-sessions';

// Initialize services
const streamingService = new DemoStreamingService();
const storageManager = new SpacesStorageManager(WORKSPACE_DIR);

// Hugging Face Spaces optimized middleware
if (IS_SPACES) {
    // Trust proxy for Spaces environment
    app.set('trust proxy', true);
    
    // Add Spaces-specific headers
    app.use((req, res, next) => {
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Powered-By', 'Doc-less API Agent on Spaces');
        next();
    });
}

// Enhanced CORS configuration for Spaces
const corsOptions = {
    origin: IS_SPACES ? true : (process.env.CORS_ORIGIN || '*'),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: false
};
app.use(cors(corsOptions));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files with proper headers
app.use(express.static('.', {
    setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
        } else if (path.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        } else if (path.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css; charset=utf-8');
        } else if (path.endsWith('.json')) {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
        } else if (path.endsWith('.md')) {
            res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
        } else if (path.endsWith('.yaml') || path.endsWith('.yml')) {
            res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
        }
        
        // Cache static assets appropriately
        if (path.includes('demo-output') || path.includes('deliverables')) {
            res.setHeader('Cache-Control', 'public, max-age=300'); // 5 minutes
        } else {
            res.setHeader('Cache-Control', 'no-cache');
        }
    }
}));

// Main route - serve the demo interface
app.get('/', (req, res) => {
    console.log(`📱 Serving demo interface to ${req.ip}`);
    res.sendFile(path.join(__dirname, 'demo-interface.html'));
});

// Health check endpoint with detailed information
app.get('/health', async (req, res) => {
    const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: IS_SPACES ? 'spaces' : 'local',
        port: PORT,
        version: process.env.npm_package_version || '1.0.0',
        memory: process.memoryUsage(),
        workspace: WORKSPACE_DIR,
        services: {
            streaming: {
                active_sessions: streamingService.getActiveSessionsCount(),
                active_streams: streamingService.getActiveStreamsCount()
            },
            storage: await storageManager.getStorageStats()
        }
    };

    // Check workspace directory
    try {
        await fs.access(WORKSPACE_DIR);
        health.workspace_accessible = true;
    } catch (error) {
        health.workspace_accessible = false;
        health.workspace_error = error.message;
    }

    res.json(health);
});

// Spaces-specific metadata endpoint
app.get('/spaces/info', (req, res) => {
    res.json({
        title: '🤖 Doc-less API Agent',
        description: 'Interactive API documentation and SDK generator demo',
        version: '1.0.0',
        features: [
            'Live API Discovery',
            'OpenAPI Generation',
            'TypeScript SDK Creation',
            'Postman Collections',
            'Mock Lab Environment',
            'Evidence Reports',
            'Real-time Demo Streaming'
        ],
        demo_paths: [
            '/ - Interactive Demo Interface',
            '/api/status - Service Status',
            '/api/demo/stream - Live Demo Stream',
            '/deliverables - Generated Files',
            '/spaces/info - This Information'
        ],
        github: 'https://github.com/ysrastogi/apiWitness',
        is_spaces: IS_SPACES,
        uptime: process.uptime()
    });
});

// Server-Sent Events endpoint for real-time demo streaming
app.get('/api/demo/stream', streamingService.createSSEEndpoint());

// API endpoints for demo integration
app.get('/api/status', async (req, res) => {
    const status = {
        services: {
            main_server: `http://localhost:${PORT}`,
            demo_interface: `http://localhost:${PORT}/`,
            deliverables: `http://localhost:${PORT}/deliverables`,
            demo_stream: `http://localhost:${PORT}/api/demo/stream`
        },
        environment: {
            is_spaces: IS_SPACES,
            workspace: WORKSPACE_DIR,
            node_env: process.env.NODE_ENV || 'development'
        },
        demo: {
            interface_url: `http://localhost:${PORT}`,
            deliverables_url: `http://localhost:${PORT}/deliverables`,
            health_check: `http://localhost:${PORT}/health`,
            streaming_url: `http://localhost:${PORT}/api/demo/stream`
        },
        streaming: {
            active_sessions: streamingService.getActiveSessionsCount(),
            active_streams: streamingService.getActiveStreamsCount()
        },
        timestamp: new Date().toISOString()
    };

    // Check if demo assets exist
    try {
        const demoOutputs = await fs.readdir('.', { withFileTypes: true });
        const demoFolders = demoOutputs
            .filter(dirent => dirent.isDirectory() && dirent.name.startsWith('demo-output-'))
            .map(dirent => dirent.name);
        
        status.available_demos = demoFolders;
    } catch (error) {
        status.demo_scan_error = error.message;
    }

    res.json(status);
});

// Demo session management for Spaces
app.post('/api/demo/start', async (req, res) => {
    try {
        const { sessionId, config = {} } = req.body;
        const finalSessionId = sessionId || `demo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Create storage session
        const session = await storageManager.createSession(finalSessionId);
        
        // Start streaming demo
        const demoConfig = streamingService.startDemoSession(finalSessionId, {
            delays: config.delays !== false, // Default to true
            realExecution: config.realExecution || false,
            ...config
        });
        
        console.log(`🎬 Demo started: ${finalSessionId}`);
        res.json({
            sessionId: finalSessionId,
            session,
            demoConfig,
            streamUrl: `/api/demo/stream?sessionId=${finalSessionId}`
        });
        
    } catch (error) {
        console.error('❌ Error starting demo:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get demo session status
app.get('/api/demo/:sessionId/status', (req, res) => {
    const { sessionId } = req.params;
    const status = streamingService.getSessionStatus(sessionId);
    
    if (status) {
        res.json(status);
    } else {
        res.status(404).json({ error: 'Session not found' });
    }
});

// Save demo result file
app.post('/api/demo/:sessionId/save', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { fileName, content, metadata } = req.body;
        
        if (!fileName || content === undefined) {
            return res.status(400).json({ error: 'fileName and content are required' });
        }
        
        const filePath = await storageManager.saveFile(sessionId, fileName, content, metadata);
        
        res.json({
            success: true,
            fileName,
            path: filePath,
            sessionId
        });
        
    } catch (error) {
        console.error('❌ Error saving file:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get demo session files
app.get('/api/demo/:sessionId/files', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const session = await storageManager.getSession(sessionId);
        
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }
        
        res.json({
            sessionId,
            files: session.files || []
        });
        
    } catch (error) {
        console.error('❌ Error getting session files:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get specific file from session
app.get('/api/demo/:sessionId/files/:fileName', async (req, res) => {
    try {
        const { sessionId, fileName } = req.params;
        const content = await storageManager.getFile(sessionId, fileName);
        
        if (content === null) {
            return res.status(404).json({ error: 'File not found' });
        }
        
        // Set appropriate content type
        if (fileName.endsWith('.json')) {
            res.setHeader('Content-Type', 'application/json');
        } else if (fileName.endsWith('.md')) {
            res.setHeader('Content-Type', 'text/markdown');
        } else if (fileName.endsWith('.yaml') || fileName.endsWith('.yml')) {
            res.setHeader('Content-Type', 'text/yaml');
        } else if (fileName.endsWith('.ts')) {
            res.setHeader('Content-Type', 'text/typescript');
        }
        
        res.send(content);
        
    } catch (error) {
        console.error('❌ Error getting file:', error);
        res.status(500).json({ error: error.message });
    }
});

// Serve deliverables directory with better error handling
app.use('/deliverables', express.static('demo-output-*', {
    setHeaders: (res, path) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        if (path.endsWith('.json')) {
            res.setHeader('Content-Type', 'application/json');
        } else if (path.endsWith('.md')) {
            res.setHeader('Content-Type', 'text/markdown');
        } else if (path.endsWith('.yaml') || path.endsWith('.yml')) {
            res.setHeader('Content-Type', 'text/yaml');
        }
    }
}));

// Serve static demo outputs if available
app.get('/demo-assets/:asset', async (req, res) => {
    const asset = req.params.asset;
    
    try {
        // Look for the asset in any demo-output directory
        const dirs = await fs.readdir('.');
        const demoDir = dirs.find(dir => dir.startsWith('demo-output-'));
        
        if (demoDir) {
            const assetPath = path.join(demoDir, asset);
            await fs.access(assetPath);
            res.sendFile(path.resolve(assetPath));
        } else {
            res.status(404).json({ error: 'Demo assets not found' });
        }
    } catch (error) {
        console.error(`❌ Error serving asset ${asset}:`, error);
        res.status(404).json({ error: 'Asset not found' });
    }
});

// Analytics endpoint (privacy-compliant)
app.post('/api/analytics', (req, res) => {
    const { event, category, label, value } = req.body;
    
    // Log analytics data (can be enhanced to send to analytics service)
    console.log(`📊 Analytics: ${category}/${event}`, { 
        label, 
        value, 
        timestamp: new Date().toISOString(),
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });
    
    res.json({ status: 'logged' });
});

// Storage management endpoints
app.get('/api/storage/stats', async (req, res) => {
    try {
        const stats = await storageManager.getStorageStats();
        res.json(stats);
    } catch (error) {
        console.error('❌ Error getting storage stats:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/storage/cleanup', async (req, res) => {
    try {
        const deletedCount = await storageManager.cleanup();
        res.json({ success: true, deleted: deletedCount });
    } catch (error) {
        console.error('❌ Error during cleanup:', error);
        res.status(500).json({ error: error.message });
    }
});

// 404 handler - redirect to demo interface for SPA behavior
app.use((req, res) => {
    console.log(`🔍 404 for ${req.path}, redirecting to demo interface`);
    res.status(404).sendFile(path.join(__dirname, 'demo-interface.html'));
});

// Enhanced error handler
app.use((error, req, res, next) => {
    console.error('❌ Server Error:', {
        message: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method,
        timestamp: new Date().toISOString()
    });
    
    res.status(error.status || 500).json({
        error: IS_SPACES ? 'Internal Server Error' : error.message,
        timestamp: new Date().toISOString(),
        path: req.path
    });
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🛑 SIGINT received, shutting down gracefully');
    process.exit(0);
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Doc-less API Agent ${IS_SPACES ? '(Spaces)' : '(Local)'} running on:`);
    console.log(`   Local:    http://localhost:${PORT}`);
    console.log(`   Network:  http://0.0.0.0:${PORT}`);
    console.log(`   Health:   http://localhost:${PORT}/health`);
    console.log(`   API:      http://localhost:${PORT}/api/status`);
    console.log(`   Stream:   http://localhost:${PORT}/api/demo/stream`);
    console.log(`   Info:     http://localhost:${PORT}/spaces/info`);
    console.log('');
    console.log('📁 Serving files from:', __dirname);
    console.log('💾 Workspace directory:', WORKSPACE_DIR);
    console.log('🎯 Environment:', IS_SPACES ? 'Hugging Face Spaces' : 'Local Development');
    console.log(`🎥 Streaming service: ${streamingService.getActiveSessionsCount()} active sessions`);
});

module.exports = app;
