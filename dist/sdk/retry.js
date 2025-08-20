"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RetryHandler = void 0;
exports.withRetry = withRetry;
exports.retry = retry;
class RetryHandler {
    constructor(config = {}) {
        this.config = {
            maxRetries: 3,
            baseDelay: 1000,
            maxDelay: 30000,
            jitterFactor: 0.1,
            retryOnStatus: [429, 500, 502, 503, 504],
            respectRetryAfter: true,
            ...config
        };
    }
    /**
     * Execute a function with retry logic
     */
    async executeWithRetry(operation, context) {
        let lastError = null;
        for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
            try {
                const result = await operation();
                if (attempt > 0) {
                    console.log(`✅ Retry successful on attempt ${attempt + 1}${context ? ` for ${context}` : ''}`);
                }
                return result;
            }
            catch (error) {
                lastError = error;
                // Don't retry on last attempt
                if (attempt === this.config.maxRetries) {
                    break;
                }
                // Check if error is retryable
                if (!this.isRetryable(error)) {
                    throw error;
                }
                const delay = this.calculateDelay(attempt, error);
                console.log(`⏳ Attempt ${attempt + 1} failed, retrying in ${delay}ms${context ? ` for ${context}` : ''}...`);
                console.log(`   Error: ${error.message}`);
                await this.sleep(delay);
            }
        }
        throw new Error(`Max retries (${this.config.maxRetries}) exceeded. Last error: ${lastError?.message || 'Unknown error'}`);
    }
    /**
     * Check if an error is retryable based on status code and configuration
     */
    isRetryable(error) {
        const retryableError = error;
        // If explicitly marked as not retryable
        if (retryableError.isRetryable === false) {
            return false;
        }
        // If explicitly marked as retryable
        if (retryableError.isRetryable === true) {
            return true;
        }
        // Check HTTP status codes
        if (retryableError.status && this.config.retryOnStatus.includes(retryableError.status)) {
            return true;
        }
        // Network errors (no status code) are generally retryable
        if (!retryableError.status) {
            return true;
        }
        return false;
    }
    /**
     * Calculate delay for next retry attempt
     */
    calculateDelay(attempt, error) {
        let delay;
        // Respect Retry-After header if present and configured to do so
        if (this.config.respectRetryAfter && error?.retryAfter) {
            delay = error.retryAfter * 1000; // Convert seconds to milliseconds
            console.log(`   Using Retry-After header: ${error.retryAfter}s`);
        }
        else {
            // Exponential backoff: delay = baseDelay * (2^attempt)
            delay = this.config.baseDelay * Math.pow(2, attempt);
        }
        // Apply jitter to avoid thundering herd
        const jitter = delay * this.config.jitterFactor * Math.random();
        delay = delay + jitter;
        // Cap at max delay
        delay = Math.min(delay, this.config.maxDelay);
        return Math.floor(delay);
    }
    /**
     * Sleep for specified duration
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * Create a retryable error from an HTTP response
     */
    static createRetryableError(message, status, retryAfter, isRetryable) {
        const error = new Error(message);
        error.status = status;
        error.retryAfter = retryAfter;
        error.isRetryable = isRetryable ?? true;
        return error;
    }
    /**
     * Parse Retry-After header value
     * Can be either seconds (number) or HTTP date
     */
    static parseRetryAfter(retryAfter) {
        if (!retryAfter)
            return undefined;
        // Try parsing as number (seconds)
        const seconds = parseInt(retryAfter, 10);
        if (!isNaN(seconds)) {
            return seconds;
        }
        // Try parsing as HTTP date
        const date = new Date(retryAfter);
        if (!isNaN(date.getTime())) {
            const secondsUntil = Math.max(0, Math.ceil((date.getTime() - Date.now()) / 1000));
            return secondsUntil;
        }
        return undefined;
    }
}
exports.RetryHandler = RetryHandler;
/**
 * Utility function to add retry behavior to any async function
 */
function withRetry(fn, config, context) {
    const retryHandler = new RetryHandler(config);
    return async (...args) => {
        return retryHandler.executeWithRetry(() => fn(...args), context);
    };
}
/**
 * Decorator for adding retry behavior to class methods
 */
function retry(config) {
    return function (target, propertyName, descriptor) {
        const method = descriptor.value;
        const retryHandler = new RetryHandler(config);
        descriptor.value = async function (...args) {
            const context = `${target.constructor.name}.${propertyName}`;
            return retryHandler.executeWithRetry(() => method.apply(this, args), context);
        };
    };
}
//# sourceMappingURL=retry.js.map