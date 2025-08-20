import { promises as fs } from 'fs';
import * as path from 'path';
import {
  PaginatorConfig,
  PaginatorAsyncIterator,
  PaginationInfo,
  Checkpoint,
  ApiResponse,
  RateLimitInfo
} from './types';
import { RetryHandler } from './retry';

export class Paginator<T> {
  private config: PaginatorConfig;
  private retryHandler: RetryHandler;
  private currentPage: number;
  private totalProcessed: number = 0;
  private seenIds: Set<string | number> = new Set();
  private paginationInfo: PaginationInfo;
  private httpClient: (url: string, options?: any) => Promise<ApiResponse<T[]>>;

  constructor(
    private endpoint: string,
    config: PaginatorConfig,
    httpClient: (url: string, options?: any) => Promise<ApiResponse<T[]>>
  ) {
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
    this.retryHandler = new RetryHandler(this.config.retryConfig);
    this.httpClient = httpClient;

    this.paginationInfo = {
      page: this.currentPage,
      per_page: this.config.per_page || 30,
      has_next: true,
      has_prev: false
    };
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
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
        const response = await this.retryHandler.executeWithRetry(
          () => this.fetchPage(this.currentPage),
          `${this.endpoint}?page=${this.currentPage}`
        );

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

      } catch (error) {
        console.error(`❌ Failed to fetch page ${this.currentPage}:`, error);
        throw error;
      }
    }

    // Save final checkpoint
    if (this.config.checkpointFile) {
      await this.saveCheckpoint();
    }
  }

  private async fetchPage(page: number): Promise<ApiResponse<T[]>> {
    const params = new URLSearchParams();
    params.set('page', page.toString());
    params.set('per_page', (this.config.per_page || 30).toString());

    // Add other pagination options
    if (this.config.since) params.set('since', this.config.since);
    if (this.config.until) params.set('until', this.config.until);
    if (this.config.sort) params.set('sort', this.config.sort);
    if (this.config.direction) params.set('direction', this.config.direction);

    const url = `${this.endpoint}?${params.toString()}`;
    return this.httpClient(url);
  }

  private updatePaginationInfo(response: ApiResponse<T[]>): void {
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

  private parseLinkHeader(linkHeader?: string): Record<string, string> {
    const links: Record<string, string> = {};
    
    if (!linkHeader) return links;

    const linkRegex = /<([^>]+)>;\s*rel="([^"]+)"/g;
    let match;
    
    while ((match = linkRegex.exec(linkHeader)) !== null) {
      links[match[2]] = match[1];
    }

    return links;
  }

  private deduplicateItems(items: T[]): T[] {
    if (!this.config.deduplication?.enabled) return items;

    const keyField = this.config.deduplication.keyField;
    const uniqueItems: T[] = [];

    for (const item of items) {
      const key = (item as any)[keyField];
      if (!this.seenIds.has(key)) {
        this.seenIds.add(key);
        uniqueItems.push(item);
      }
    }

    return uniqueItems;
  }

  public getInfo(): PaginationInfo {
    return { ...this.paginationInfo };
  }

  public getTotalProcessed(): number {
    return this.totalProcessed;
  }

  public async saveCheckpoint(): Promise<void> {
    if (!this.config.checkpointFile) return;

    const checkpoint: Checkpoint = {
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
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(this.config.checkpointFile, JSON.stringify(checkpoint, null, 2));
    } catch (error) {
      console.warn(`⚠️  Failed to save checkpoint: ${error}`);
    }
  }

  public async loadCheckpoint(): Promise<Checkpoint | null> {
    if (!this.config.checkpointFile) return null;

    try {
      const data = await fs.readFile(this.config.checkpointFile, 'utf-8');
      const checkpoint: Checkpoint = JSON.parse(data);
      
      // Validate checkpoint is for the same endpoint and configuration
      if (checkpoint.endpoint === this.endpoint &&
          checkpoint.per_page === (this.config.per_page || 30)) {
        return checkpoint;
      } else {
        console.warn(`⚠️  Checkpoint mismatch, starting fresh`);
        return null;
      }
    } catch (error) {
      // Checkpoint file doesn't exist or is invalid
      return null;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Utility function to create a simple paginator for common use cases
 */
export function createPaginator<T>(
  endpoint: string,
  config: PaginatorConfig,
  httpClient: (url: string, options?: any) => Promise<ApiResponse<T[]>>
): Paginator<T> {
  return new Paginator(endpoint, config, httpClient);
}

/**
 * Helper function to collect all pages into an array (use with caution for large datasets)
 */
export async function collectAll<T>(paginator: Paginator<T>): Promise<T[]> {
  const results: T[] = [];
  
  for await (const item of paginator) {
    results.push(item);
  }
  
  return results;
}

/**
 * Helper function to process pages in batches
 */
export async function processBatches<T>(
  paginator: Paginator<T>,
  batchSize: number,
  processor: (batch: T[]) => Promise<void>
): Promise<void> {
  let batch: T[] = [];
  
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
