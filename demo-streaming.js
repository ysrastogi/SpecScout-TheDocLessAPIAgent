#!/usr/bin/env node

/**
 * Real-time Demo Streaming Service
 * Provides Server-Sent Events for live demo progress updates
 */

const EventEmitter = require('events');

class DemoStreamingService extends EventEmitter {
    constructor() {
        super();
        this.activeStreams = new Map();
        this.demoSessions = new Map();
        
        // Cleanup inactive streams every 5 minutes
        setInterval(() => this.cleanupStreams(), 5 * 60 * 1000);
        
        console.log('🎥 Demo Streaming Service initialized');
    }

    /**
     * Create SSE endpoint for Express app
     */
    createSSEEndpoint() {
        return (req, res) => {
            const sessionId = req.query.sessionId || 'default';
            
            // Set up SSE headers
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Cache-Control',
                'X-Accel-Buffering': 'no' // Disable nginx buffering
            });

            // Send initial connection event
            this.sendSSE(res, 'connected', {
                sessionId,
                timestamp: new Date().toISOString(),
                message: 'Demo stream connected'
            });

            // Store the stream
            const streamId = `${sessionId}-${Date.now()}`;
            this.activeStreams.set(streamId, {
                sessionId,
                response: res,
                connectedAt: new Date(),
                lastActivity: new Date()
            });

            console.log(`📡 SSE stream connected: ${streamId}`);

            // Handle client disconnect
            req.on('close', () => {
                this.activeStreams.delete(streamId);
                console.log(`📡 SSE stream disconnected: ${streamId}`);
            });

            // Send keepalive every 30 seconds
            const keepAlive = setInterval(() => {
                if (this.activeStreams.has(streamId)) {
                    this.sendSSE(res, 'keepalive', { timestamp: new Date().toISOString() });
                } else {
                    clearInterval(keepAlive);
                }
            }, 30000);
        };
    }

    /**
     * Start a new demo session
     */
    startDemoSession(sessionId, config = {}) {
        const demoConfig = {
            sessionId,
            startTime: new Date(),
            steps: this.getDefaultDemoSteps(),
            currentStep: 0,
            totalSteps: 13,
            config: {
                delays: config.delays || false,
                realExecution: config.realExecution || false,
                ...config
            }
        };

        this.demoSessions.set(sessionId, demoConfig);
        
        this.broadcastToSession(sessionId, 'demo-started', {
            sessionId,
            config: demoConfig.config,
            totalSteps: demoConfig.totalSteps
        });

        console.log(`🎬 Demo session started: ${sessionId}`);
        
        // Start executing demo steps
        this.executeDemoSteps(sessionId);
        
        return demoConfig;
    }

    /**
     * Execute demo steps with real-time updates
     */
    async executeDemoSteps(sessionId) {
        const session = this.demoSessions.get(sessionId);
        if (!session) return;

        const steps = session.steps;
        
        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            session.currentStep = i + 1;
            
            // Broadcast step start
            this.broadcastToSession(sessionId, 'step-started', {
                stepId: step.id,
                stepNumber: i + 1,
                totalSteps: steps.length,
                title: step.title,
                description: step.description
            });

            try {
                // Execute the step
                await this.executeStep(sessionId, step);
                
                // Broadcast step completion
                this.broadcastToSession(sessionId, 'step-completed', {
                    stepId: step.id,
                    stepNumber: i + 1,
                    totalSteps: steps.length,
                    title: step.title,
                    result: step.result || {}
                });

            } catch (error) {
                // Broadcast step error
                this.broadcastToSession(sessionId, 'step-error', {
                    stepId: step.id,
                    stepNumber: i + 1,
                    title: step.title,
                    error: error.message
                });
                
                console.error(`❌ Step failed in ${sessionId}:`, error);
            }

            // Add delay between steps if configured
            if (session.config.delays) {
                await this.delay(step.duration || 1000);
            }
        }

        // Demo complete
        session.endTime = new Date();
        const duration = session.endTime - session.startTime;
        
        this.broadcastToSession(sessionId, 'demo-completed', {
            sessionId,
            duration,
            totalSteps: steps.length,
            deliverables: this.generateDemoDeliverables(sessionId)
        });

        console.log(`✅ Demo session completed: ${sessionId} (${duration}ms)`);
    }

    /**
     * Execute individual demo step
     */
    async executeStep(sessionId, step) {
        const session = this.demoSessions.get(sessionId);
        if (!session) throw new Error('Session not found');

        // Simulate step execution based on type
        switch (step.type) {
            case 'setup':
                await this.executeSetupStep(sessionId, step);
                break;
            case 'discovery':
                await this.executeDiscoveryStep(sessionId, step);
                break;
            case 'generation':
                await this.executeGenerationStep(sessionId, step);
                break;
            case 'testing':
                await this.executeTestingStep(sessionId, step);
                break;
            default:
                await this.executeGenericStep(sessionId, step);
        }
    }

    async executeSetupStep(sessionId, step) {
        // Simulate setup operations
        const operations = [
            'Installing dependencies...',
            'Starting services...',
            'Configuring environment...',
            'Setup complete ✅'
        ];

        for (const op of operations) {
            this.broadcastToSession(sessionId, 'step-progress', {
                stepId: step.id,
                message: op,
                timestamp: new Date().toISOString()
            });
            
            if (step.duration) await this.delay(step.duration / operations.length);
        }
    }

    async executeDiscoveryStep(sessionId, step) {
        // Simulate API discovery
        const discoveries = [
            'Scanning GitHub API endpoints...',
            'Found pagination patterns 📄',
            'Detected rate limiting headers ⏱️',
            'Analyzing authentication methods 🔐',
            'Discovery complete ✅'
        ];

        for (const discovery of discoveries) {
            this.broadcastToSession(sessionId, 'step-progress', {
                stepId: step.id,
                message: discovery,
                timestamp: new Date().toISOString()
            });
            
            if (step.duration) await this.delay(step.duration / discoveries.length);
        }

        step.result = {
            endpoints: 8,
            patterns: ['pagination', 'rate-limiting', 'authentication'],
            apiCalls: 5
        };
    }

    async executeGenerationStep(sessionId, step) {
        // Simulate code generation
        const generations = [
            'Generating TypeScript interfaces...',
            'Creating SDK client methods...',
            'Implementing pagination logic...',
            'Adding retry mechanisms...',
            'Writing OpenAPI specification...',
            'Generation complete ✅'
        ];

        for (const gen of generations) {
            this.broadcastToSession(sessionId, 'step-progress', {
                stepId: step.id,
                message: gen,
                timestamp: new Date().toISOString()
            });
            
            if (step.duration) await this.delay(step.duration / generations.length);
        }

        step.result = {
            filesGenerated: ['index.ts', 'types.ts', 'paginator.ts', 'retry.ts', 'openapi.yaml'],
            linesOfCode: 1247
        };
    }

    async executeTestingStep(sessionId, step) {
        // Simulate testing
        const tests = [
            'Running unit tests...',
            'Testing API integration...',
            'Validating pagination...',
            'Checking error handling...',
            'All tests passed ✅'
        ];

        for (const test of tests) {
            this.broadcastToSession(sessionId, 'step-progress', {
                stepId: step.id,
                message: test,
                timestamp: new Date().toISOString()
            });
            
            if (step.duration) await this.delay(step.duration / tests.length);
        }

        step.result = {
            testsPassed: 15,
            coverage: '97%'
        };
    }

    async executeGenericStep(sessionId, step) {
        this.broadcastToSession(sessionId, 'step-progress', {
            stepId: step.id,
            message: step.description,
            timestamp: new Date().toISOString()
        });

        if (step.duration) await this.delay(step.duration);
    }

    /**
     * Broadcast message to all streams for a session
     */
    broadcastToSession(sessionId, event, data) {
        const streams = Array.from(this.activeStreams.values())
            .filter(stream => stream.sessionId === sessionId);

        streams.forEach(stream => {
            this.sendSSE(stream.response, event, data);
            stream.lastActivity = new Date();
        });

        console.log(`📡 Broadcasted ${event} to ${streams.length} streams for ${sessionId}`);
    }

    /**
     * Send Server-Sent Event
     */
    sendSSE(res, event, data) {
        try {
            const sseData = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
            res.write(sseData);
        } catch (error) {
            console.error('❌ Error sending SSE:', error);
        }
    }

    /**
     * Clean up inactive streams
     */
    cleanupStreams() {
        const now = new Date();
        const timeout = 10 * 60 * 1000; // 10 minutes
        let cleaned = 0;

        for (const [streamId, stream] of this.activeStreams.entries()) {
            if (now - stream.lastActivity > timeout) {
                this.activeStreams.delete(streamId);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            console.log(`🧹 Cleaned up ${cleaned} inactive streams`);
        }
    }

    /**
     * Get default demo steps configuration
     */
    getDefaultDemoSteps() {
        return [
            {
                id: 'clone',
                title: 'Clone Repository',
                description: 'Cloning the API repository',
                type: 'setup',
                duration: 2000
            },
            {
                id: 'setup',
                title: 'Setup Environment',
                description: 'Installing dependencies and starting services',
                type: 'setup',
                duration: 3000
            },
            {
                id: 'discover',
                title: 'API Discovery',
                description: 'Discovering GitHub API endpoints and patterns',
                type: 'discovery',
                duration: 4000
            },
            {
                id: 'generate',
                title: 'Generate SDK',
                description: 'Creating TypeScript SDK with pagination support',
                type: 'generation',
                duration: 3000
            },
            {
                id: 'test',
                title: 'Test Integration',
                description: 'Testing generated SDK with live API',
                type: 'testing',
                duration: 3000
            },
            {
                id: 'mock-setup',
                title: 'Setup Mock Lab',
                description: 'Starting OAuth2, Payment, and Webhook services',
                type: 'setup',
                duration: 2000
            },
            {
                id: 'oauth-test',
                title: 'Test OAuth2',
                description: 'Testing OAuth2 PKCE flow and idempotency',
                type: 'testing',
                duration: 3000
            },
            {
                id: 'webhook-test',
                title: 'Test Webhooks',
                description: 'Testing webhook HMAC verification',
                type: 'testing',
                duration: 2500
            },
            {
                id: 'sdk-core',
                title: 'Build Core SDK',
                description: 'Implementing base client and paginator',
                type: 'generation',
                duration: 4000
            },
            {
                id: 'evidence',
                title: 'Generate Evidence',
                description: 'Creating comprehensive evidence report',
                type: 'generation',
                duration: 3000
            }
        ];
    }

    /**
     * Generate demo deliverables summary
     */
    generateDemoDeliverables(sessionId) {
        return {
            openapi_spec: 'openapi.yaml',
            typescript_sdk: ['index.ts', 'types.ts', 'paginator.ts', 'retry.ts'],
            postman_collection: 'postman_collection.json',
            evidence_report: 'evidence.md',
            test_results: 'test-results.json',
            mock_environment: 'mock-lab/'
        };
    }

    /**
     * Utility delay function
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get active sessions count
     */
    getActiveSessionsCount() {
        return this.demoSessions.size;
    }

    /**
     * Get active streams count
     */
    getActiveStreamsCount() {
        return this.activeStreams.size;
    }

    /**
     * Get session status
     */
    getSessionStatus(sessionId) {
        return this.demoSessions.get(sessionId) || null;
    }
}

module.exports = DemoStreamingService;
