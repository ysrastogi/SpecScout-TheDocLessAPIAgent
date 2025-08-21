#!/usr/bin/env node

const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all routes
app.use(cors());

// Serve static files
app.use(express.static('.'));

// Main route - serve the demo interface
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'demo-interface.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// API endpoints for demo integration
app.get('/api/status', (req, res) => {
    res.json({
        services: {
            oauth2: 'http://localhost:3003',
            payment: 'http://localhost:3001',
            webhook: 'http://localhost:3004'
        },
        demo: {
            interface: `http://localhost:${PORT}`,
            deliverables: `http://localhost:${PORT}/deliverables`
        }
    });
});

// Serve deliverables directory
app.use('/deliverables', express.static('demo-output-*', {
    setHeaders: (res, path) => {
        if (path.endsWith('.json')) {
            res.setHeader('Content-Type', 'application/json');
        } else if (path.endsWith('.md')) {
            res.setHeader('Content-Type', 'text/markdown');
        } else if (path.endsWith('.yaml') || path.endsWith('.yml')) {
            res.setHeader('Content-Type', 'text/yaml');
        }
    }
}));

// 404 handler
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'demo-interface.html'));
});

// Error handler
app.use((error, req, res, next) => {
    console.error('Server Error:', error);
    res.status(500).json({ 
        error: 'Internal Server Error',
        message: error.message 
    });
});

app.listen(PORT, () => {
    console.log(`🌐 Demo Interface Server running on:`);
    console.log(`   Local:    http://localhost:${PORT}`);
    console.log(`   Network:  http://0.0.0.0:${PORT}`);
    console.log(`   Health:   http://localhost:${PORT}/health`);
    console.log(`   API:      http://localhost:${PORT}/api/status`);
    console.log('');
    console.log('📁 Serving files from:', __dirname);
});

module.exports = app;
