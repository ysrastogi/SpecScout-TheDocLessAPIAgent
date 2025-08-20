import { PaginatorConfig, PaginationInfo, Checkpoint, ApiResponse } from './types';
export declare class Paginator<T> {
    private endpoint;
    private config;
    private retryHandler;
    private currentPage;
    private totalProcessed;
    private seenIds;
    private paginationInfo;
    private httpClient;
    constructor(endpoint: string, config: PaginatorConfig, httpClient: (url: string, options?: any) => Promise<ApiResponse<T[]>>);
    [Symbol.asyncIterator](): AsyncIterator<T>;
    private fetchPage;
    private updatePaginationInfo;
    private parseLinkHeader;
    private deduplicateItems;
    getInfo(): PaginationInfo;
    getTotalProcessed(): number;
    saveCheckpoint(): Promise<void>;
    loadCheckpoint(): Promise<Checkpoint | null>;
    private sleep;
}
/**
 * Utility function to create a simple paginator for common use cases
 */
export declare function createPaginator<T>(endpoint: string, config: PaginatorConfig, httpClient: (url: string, options?: any) => Promise<ApiResponse<T[]>>): Paginator<T>;
/**
 * Helper function to collect all pages into an array (use with caution for large datasets)
 */
export declare function collectAll<T>(paginator: Paginator<T>): Promise<T[]>;
/**
 * Helper function to process pages in batches
 */
export declare function processBatches<T>(paginator: Paginator<T>, batchSize: number, processor: (batch: T[]) => Promise<void>): Promise<void>;
//# sourceMappingURL=paginator.d.ts.map