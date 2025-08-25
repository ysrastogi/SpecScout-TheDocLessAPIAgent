#!/usr/bin/env node

/**
 * Storage Manager for Hugging Face Spaces
 * Handles demo session persistence, cleanup, and asset management
 */

const fs = require('fs').promises;
const path = require('path');

class SpacesStorageManager {
    constructor(workspaceDir = './demo-sessions') {
        this.workspaceDir = workspaceDir;
        this.maxSessions = 100; // Limit concurrent sessions
        this.maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
        this.cleanupInterval = 60 * 60 * 1000; // Cleanup every hour
        
        this.init();
    }

    async init() {
        try {
            await fs.mkdir(this.workspaceDir, { recursive: true });
            console.log(`💾 Storage manager initialized: ${this.workspaceDir}`);
            
            // Start periodic cleanup
            this.startCleanupTimer();
            
            // Clean up on startup
            await this.cleanup();
            
        } catch (error) {
            console.error('❌ Storage manager initialization failed:', error);
        }
    }

    async createSession(sessionId = null) {
        try {
            const id = sessionId || this.generateSessionId();
            const sessionDir = path.join(this.workspaceDir, id);
            
            await fs.mkdir(sessionDir, { recursive: true });
            
            const sessionInfo = {
                id,
                created_at: new Date().toISOString(),
                last_accessed: new Date().toISOString(),
                workspace: sessionDir,
                status: 'active',
                files: []
            };
            
            const sessionFile = path.join(sessionDir, 'session.json');
            await fs.writeFile(sessionFile, JSON.stringify(sessionInfo, null, 2));
            
            console.log(`🎬 Session created: ${id}`);
            return sessionInfo;
            
        } catch (error) {
            console.error('❌ Error creating session:', error);
            throw error;
        }
    }

    async getSession(sessionId) {
        try {
            const sessionDir = path.join(this.workspaceDir, sessionId);
            const sessionFile = path.join(sessionDir, 'session.json');
            
            const data = await fs.readFile(sessionFile, 'utf8');
            const session = JSON.parse(data);
            
            // Update last accessed time
            session.last_accessed = new Date().toISOString();
            await fs.writeFile(sessionFile, JSON.stringify(session, null, 2));
            
            return session;
            
        } catch (error) {
            if (error.code === 'ENOENT') {
                return null; // Session not found
            }
            throw error;
        }
    }

    async updateSession(sessionId, updates) {
        try {
            const session = await this.getSession(sessionId);
            if (!session) {
                throw new Error(`Session ${sessionId} not found`);
            }
            
            const updatedSession = {
                ...session,
                ...updates,
                last_accessed: new Date().toISOString()
            };
            
            const sessionFile = path.join(this.workspaceDir, sessionId, 'session.json');
            await fs.writeFile(sessionFile, JSON.stringify(updatedSession, null, 2));
            
            return updatedSession;
            
        } catch (error) {
            console.error('❌ Error updating session:', error);
            throw error;
        }
    }

    async saveFile(sessionId, fileName, content, metadata = {}) {
        try {
            const sessionDir = path.join(this.workspaceDir, sessionId);
            const filePath = path.join(sessionDir, fileName);
            
            // Ensure session directory exists
            await fs.mkdir(sessionDir, { recursive: true });
            
            // Save file content
            if (typeof content === 'object') {
                await fs.writeFile(filePath, JSON.stringify(content, null, 2));
            } else {
                await fs.writeFile(filePath, content, 'utf8');
            }
            
            // Update session with file info
            const session = await this.getSession(sessionId);
            if (session) {
                const fileInfo = {
                    name: fileName,
                    path: filePath,
                    size: Buffer.byteLength(typeof content === 'object' ? JSON.stringify(content) : content),
                    created_at: new Date().toISOString(),
                    type: this.getFileType(fileName),
                    ...metadata
                };
                
                session.files = session.files || [];
                
                // Remove existing file entry if it exists
                session.files = session.files.filter(f => f.name !== fileName);
                session.files.push(fileInfo);
                
                await this.updateSession(sessionId, { files: session.files });
            }
            
            console.log(`💾 File saved: ${fileName} in session ${sessionId}`);
            return filePath;
            
        } catch (error) {
            console.error('❌ Error saving file:', error);
            throw error;
        }
    }

    async getFile(sessionId, fileName) {
        try {
            const filePath = path.join(this.workspaceDir, sessionId, fileName);
            const content = await fs.readFile(filePath, 'utf8');
            
            // Update session last accessed time
            await this.getSession(sessionId);
            
            return content;
            
        } catch (error) {
            if (error.code === 'ENOENT') {
                return null; // File not found
            }
            throw error;
        }
    }

    async listSessions() {
        try {
            const entries = await fs.readdir(this.workspaceDir, { withFileTypes: true });
            const sessions = [];
            
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    try {
                        const session = await this.getSession(entry.name);
                        if (session) {
                            sessions.push(session);
                        }
                    } catch (error) {
                        // Skip invalid sessions
                        console.warn(`⚠️ Skipping invalid session: ${entry.name}`);
                    }
                }
            }
            
            return sessions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            
        } catch (error) {
            console.error('❌ Error listing sessions:', error);
            return [];
        }
    }

    async deleteSession(sessionId) {
        try {
            const sessionDir = path.join(this.workspaceDir, sessionId);
            await fs.rm(sessionDir, { recursive: true, force: true });
            console.log(`🗑️ Session deleted: ${sessionId}`);
            return true;
            
        } catch (error) {
            console.error('❌ Error deleting session:', error);
            return false;
        }
    }

    async cleanup() {
        try {
            const sessions = await this.listSessions();
            const now = Date.now();
            let deletedCount = 0;
            
            // Sort by age, oldest first
            const sortedSessions = sessions.sort((a, b) => 
                new Date(a.last_accessed) - new Date(b.last_accessed)
            );
            
            for (const session of sortedSessions) {
                const age = now - new Date(session.last_accessed).getTime();
                
                // Delete old sessions or excess sessions
                if (age > this.maxAge || sessions.length - deletedCount > this.maxSessions) {
                    await this.deleteSession(session.id);
                    deletedCount++;
                }
            }
            
            if (deletedCount > 0) {
                console.log(`🧹 Cleanup complete: ${deletedCount} sessions deleted`);
            }
            
            return deletedCount;
            
        } catch (error) {
            console.error('❌ Cleanup error:', error);
            return 0;
        }
    }

    async getStorageStats() {
        try {
            const sessions = await this.listSessions();
            
            let totalFiles = 0;
            let totalSize = 0;
            
            for (const session of sessions) {
                if (session.files) {
                    totalFiles += session.files.length;
                    totalSize += session.files.reduce((sum, file) => sum + (file.size || 0), 0);
                }
            }
            
            return {
                total_sessions: sessions.length,
                total_files: totalFiles,
                total_size: totalSize,
                total_size_mb: (totalSize / 1024 / 1024).toFixed(2),
                oldest_session: sessions.length > 0 ? 
                    Math.min(...sessions.map(s => new Date(s.created_at).getTime())) : null,
                newest_session: sessions.length > 0 ?
                    Math.max(...sessions.map(s => new Date(s.created_at).getTime())) : null
            };
            
        } catch (error) {
            console.error('❌ Error getting storage stats:', error);
            return null;
        }
    }

    generateSessionId() {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substr(2, 8);
        return `session-${timestamp}-${random}`;
    }

    getFileType(fileName) {
        const ext = path.extname(fileName).toLowerCase();
        const types = {
            '.json': 'json',
            '.yaml': 'yaml',
            '.yml': 'yaml',
            '.md': 'markdown',
            '.ts': 'typescript',
            '.js': 'javascript',
            '.txt': 'text',
            '.html': 'html',
            '.css': 'css'
        };
        return types[ext] || 'unknown';
    }

    startCleanupTimer() {
        setInterval(async () => {
            await this.cleanup();
        }, this.cleanupInterval);
        
        console.log(`⏰ Cleanup timer started (every ${this.cleanupInterval / 1000 / 60} minutes)`);
    }

    async exportSession(sessionId, format = 'zip') {
        // This would implement session export functionality
        // For now, return session data as JSON
        try {
            const session = await this.getSession(sessionId);
            if (!session) {
                throw new Error(`Session ${sessionId} not found`);
            }
            
            const exportData = {
                session,
                files: {}
            };
            
            // Read all files in the session
            if (session.files) {
                for (const fileInfo of session.files) {
                    try {
                        const content = await this.getFile(sessionId, fileInfo.name);
                        exportData.files[fileInfo.name] = content;
                    } catch (error) {
                        console.warn(`⚠️ Could not read file ${fileInfo.name}:`, error);
                    }
                }
            }
            
            return exportData;
            
        } catch (error) {
            console.error('❌ Error exporting session:', error);
            throw error;
        }
    }
}

module.exports = SpacesStorageManager;

// CLI usage
if (require.main === module) {
    const storage = new SpacesStorageManager();
    
    // Handle CLI commands
    const command = process.argv[2];
    
    switch (command) {
        case 'cleanup':
            storage.cleanup().then(count => {
                console.log(`Cleaned up ${count} sessions`);
                process.exit(0);
            });
            break;
            
        case 'stats':
            storage.getStorageStats().then(stats => {
                console.log('Storage Statistics:');
                console.log(JSON.stringify(stats, null, 2));
                process.exit(0);
            });
            break;
            
        case 'list':
            storage.listSessions().then(sessions => {
                console.log(`Found ${sessions.length} sessions:`);
                sessions.forEach(session => {
                    console.log(`- ${session.id} (created: ${session.created_at})`);
                });
                process.exit(0);
            });
            break;
            
        default:
            console.log('Usage: node storage-manager.js [cleanup|stats|list]');
            process.exit(1);
    }
}
