import { RetryConfig, RetryableError } from './types';
export declare class RetryHandler {
    private config;
    constructor(config?: Partial<RetryConfig>);
    /**
     * Execute a function with retry logic
     */
    executeWithRetry<T>(operation: () => Promise<T>, context?: string): Promise<T>;
    /**
     * Check if an error is retryable based on status code and configuration
     */
    private isRetryable;
    /**
     * Calculate delay for next retry attempt
     */
    private calculateDelay;
    /**
     * Sleep for specified duration
     */
    private sleep;
    /**
     * Create a retryable error from an HTTP response
     */
    static createRetryableError(message: string, status?: number, retryAfter?: number, isRetryable?: boolean): RetryableError;
    /**
     * Parse Retry-After header value
     * Can be either seconds (number) or HTTP date
     */
    static parseRetryAfter(retryAfter: string): number | undefined;
}
/**
 * Utility function to add retry behavior to any async function
 */
export declare function withRetry<T extends any[], R>(fn: (...args: T) => Promise<R>, config?: Partial<RetryConfig>, context?: string): (...args: T) => Promise<R>;
/**
 * Decorator for adding retry behavior to class methods
 */
export declare function retry(config?: Partial<RetryConfig>): <T extends any[], R>(target: any, propertyName: string, descriptor: TypedPropertyDescriptor<(...args: T) => Promise<R>>) => void;
//# sourceMappingURL=retry.d.ts.map