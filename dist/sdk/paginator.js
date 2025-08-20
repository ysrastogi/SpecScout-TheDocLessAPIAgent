"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.Paginator = void 0;
exports.createPaginator = createPaginator;
exports.collectAll = collectAll;
exports.processBatches = processBatches;
const fs_1 = require("fs");
const path = __importStar(require("path"));
const retry_1 = require("./retry");
class Paginator {
    constructor(endpoint, config, httpClient) {
        this.endpoint = endpoint;
        this.totalProcessed = 0;
        this.seenIds = new Set();
        this.config = {
            page: 1,
            per_page: 30,
            saveInterval: 100,
            resumeFromCheckpoint: true,
            deduplication: {
                enabled: true,
                keyField: 'id'
            },
            ...config
        };
        this.currentPage = this.config.page || 1;
        this.retryHandler = new retry_1.RetryHandler(this.config.retryConfig);
        this.httpClient = httpClient;
        this.paginationInfo = {
            page: this.currentPage,
            per_page: this.config.per_page || 30,
            has_next: true,
            has_prev: false
        };
    }
    async *[Symbol.asyncIterator]() {
        // Try to load checkpoint if configured
        if (this.config.resumeFromCheckpoint && this.config.checkpointFile) {
            const checkpoint = await this.loadCheckpoint();
            if (checkpoint) {
                this.currentPage = checkpoint.page;
                this.totalProcessed = checkpoint.total_processed;
                console.log(`📄 Resuming from checkpoint: page ${checkpoint.page}, ${checkpoint.total_processed} items processed`);
            }
        }
        let hasMore = true;
        while (hasMore) {
            try {
                const response = await this.retryHandler.executeWithRetry(() => this.fetchPage(this.currentPage), `${this.endpoint}?page=${this.currentPage}`);
                this.updatePaginationInfo(response);
                // Process items with optional deduplication
                const items = this.config.deduplication?.enabled
                    ? this.deduplicateItems(response.data)
                    : response.data;
                for (const item of items) {
                    yield item;
                    this.totalProcessed++;
                    // Save checkpoint periodically
                    if (this.config.saveInterval &&
                        this.totalProcessed % this.config.saveInterval === 0) {
                        await this.saveCheckpoint();
                    }
                }
                // Check if there are more pages
                hasMore = this.paginationInfo.has_next;
                if (hasMore) {
                    this.currentPage++;
                    this.paginationInfo.page = this.currentPage;
                }
                // Respect rate limiting
                if (response.rate_limit.remaining < 10) {
                    const resetTime = response.rate_limit.reset * 1000;
                    const waitTime = Math.max(0, resetTime - Date.now());
                    if (waitTime > 0) {
                        console.log(`⏰ Rate limit approaching, waiting ${Math.ceil(waitTime / 1000)}s until reset...`);
                        await this.sleep(waitTime);
                    }
                }
            }
            catch (error) {
                console.error(`❌ Failed to fetch page ${this.currentPage}:`, error);
                throw error;
            }
        }
        // Save final checkpoint
        if (this.config.checkpointFile) {
            await this.saveCheckpoint();
        }
    }
    async fetchPage(page) {
        const params = new URLSearchParams();
        params.set('page', page.toString());
        params.set('per_page', (this.config.per_page || 30).toString());
        // Add other pagination options
        if (this.config.since)
            params.set('since', this.config.since);
        if (this.config.until)
            params.set('until', this.config.until);
        if (this.config.sort)
            params.set('sort', this.config.sort);
        if (this.config.direction)
            params.set('direction', this.config.direction);
        const url = `${this.endpoint}?${params.toString()}`;
        return this.httpClient(url);
    }
    updatePaginationInfo(response) {
        const linkHeader = response.headers.link || response.headers.Link;
        const links = this.parseLinkHeader(linkHeader);
        this.paginationInfo = {
            ...this.paginationInfo,
            has_next: !!links.next,
            has_prev: !!links.prev,
            next_url: links.next,
            prev_url: links.prev,
            first_url: links.first,
            last_url: links.last
        };
    }
    parseLinkHeader(linkHeader) {
        const links = {};
        if (!linkHeader)
            return links;
        const linkRegex = /<([^>]+)>;\s*rel="([^"]+)"/g;
        let match;
        while ((match = linkRegex.exec(linkHeader)) !== null) {
            links[match[2]] = match[1];
        }
        return links;
    }
    deduplicateItems(items) {
        if (!this.config.deduplication?.enabled)
            return items;
        const keyField = this.config.deduplication.keyField;
        const uniqueItems = [];
        for (const item of items) {
            const key = item[keyField];
            if (!this.seenIds.has(key)) {
                this.seenIds.add(key);
                uniqueItems.push(item);
            }
        }
        return uniqueItems;
    }
    getInfo() {
        return { ...this.paginationInfo };
    }
    getTotalProcessed() {
        return this.totalProcessed;
    }
    async saveCheckpoint() {
        if (!this.config.checkpointFile)
            return;
        const checkpoint = {
            endpoint: this.endpoint,
            page: this.currentPage,
            per_page: this.config.per_page || 30,
            total_processed: this.totalProcessed,
            timestamp: new Date().toISOString(),
            options: {
                since: this.config.since,
                until: this.config.until,
                sort: this.config.sort,
                direction: this.config.direction
            }
        };
        try {
            const dir = path.dirname(this.config.checkpointFile);
            await fs_1.promises.mkdir(dir, { recursive: true });
            await fs_1.promises.writeFile(this.config.checkpointFile, JSON.stringify(checkpoint, null, 2));
        }
        catch (error) {
            console.warn(`⚠️  Failed to save checkpoint: ${error}`);
        }
    }
    async loadCheckpoint() {
        if (!this.config.checkpointFile)
            return null;
        try {
            const data = await fs_1.promises.readFile(this.config.checkpointFile, 'utf-8');
            const checkpoint = JSON.parse(data);
            // Validate checkpoint is for the same endpoint and configuration
            if (checkpoint.endpoint === this.endpoint &&
                checkpoint.per_page === (this.config.per_page || 30)) {
                return checkpoint;
            }
            else {
                console.warn(`⚠️  Checkpoint mismatch, starting fresh`);
                return null;
            }
        }
        catch (error) {
            // Checkpoint file doesn't exist or is invalid
            return null;
        }
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
exports.Paginator = Paginator;
/**
 * Utility function to create a simple paginator for common use cases
 */
function createPaginator(endpoint, config, httpClient) {
    return new Paginator(endpoint, config, httpClient);
}
/**
 * Helper function to collect all pages into an array (use with caution for large datasets)
 */
async function collectAll(paginator) {
    const results = [];
    for await (const item of paginator) {
        results.push(item);
    }
    return results;
}
/**
 * Helper function to process pages in batches
 */
async function processBatches(paginator, batchSize, processor) {
    let batch = [];
    for await (const item of paginator) {
        batch.push(item);
        if (batch.length >= batchSize) {
            await processor([...batch]);
            batch = [];
        }
    }
    // Process remaining items
    if (batch.length > 0) {
        await processor(batch);
    }
}
//# sourceMappingURL=paginator.js.map