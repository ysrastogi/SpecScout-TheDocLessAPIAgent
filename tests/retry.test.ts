import { RetryHandler } from '../sdk/retry';

describe('RetryHandler', () => {
  let retryHandler: RetryHandler;

  beforeEach(() => {
    retryHandler = new RetryHandler({
      maxRetries: 3,
      baseDelay: 100,
      maxDelay: 5000,
      jitterFactor: 0.1,
      retryOnStatus: [429, 500, 502, 503, 504],
      respectRetryAfter: true
    });
  });

  describe('executeWithRetry', () => {
    it('should return result immediately on success', async () => {
      const mockOperation = jest.fn().mockResolvedValue('success');
      
      const result = await retryHandler.executeWithRetry(mockOperation);
      
      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable errors', async () => {
      const mockOperation = jest.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValue('success');
      
      const result = await retryHandler.executeWithRetry(mockOperation);
      
      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(3);
    });

    it('should respect max retries limit', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new Error('Persistent error'));
      
      await expect(retryHandler.executeWithRetry(mockOperation))
        .rejects.toThrow('Max retries (3) exceeded');
      
      expect(mockOperation).toHaveBeenCalledTimes(4); // Initial attempt + 3 retries
    });

    it('should not retry non-retryable errors', async () => {
      const nonRetryableError = new Error('Bad request') as any;
      nonRetryableError.status = 400;
      nonRetryableError.isRetryable = false;
      
      const mockOperation = jest.fn().mockRejectedValue(nonRetryableError);
      
      await expect(retryHandler.executeWithRetry(mockOperation))
        .rejects.toThrow('Bad request');
      
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });
  });

  describe('parseRetryAfter', () => {
    it('should parse numeric retry-after values', () => {
      expect(RetryHandler.parseRetryAfter('60')).toBe(60);
      expect(RetryHandler.parseRetryAfter('0')).toBe(0);
      expect(RetryHandler.parseRetryAfter('3600')).toBe(3600);
    });

    it('should parse HTTP date retry-after values', () => {
      const future = new Date(Date.now() + 60000); // 1 minute from now
      const retryAfter = RetryHandler.parseRetryAfter(future.toUTCString());
      
      expect(retryAfter).toBeGreaterThan(50); // Should be close to 60 seconds
      expect(retryAfter).toBeLessThan(70);
    });

    it('should return undefined for invalid values', () => {
      expect(RetryHandler.parseRetryAfter('')).toBeUndefined();
      expect(RetryHandler.parseRetryAfter('invalid')).toBeUndefined();
    });
  });

  describe('createRetryableError', () => {
    it('should create retryable error with all properties', () => {
      const error = RetryHandler.createRetryableError(
        'Rate limit exceeded',
        429,
        60,
        true
      );

      expect(error.message).toBe('Rate limit exceeded');
      expect(error.status).toBe(429);
      expect(error.retryAfter).toBe(60);
      expect(error.isRetryable).toBe(true);
    });

    it('should default isRetryable to true', () => {
      const error = RetryHandler.createRetryableError('Server error', 500);
      expect(error.isRetryable).toBe(true);
    });
  });

  describe('delay calculation', () => {
    it('should calculate exponential backoff delays', async () => {
      const delays: number[] = [];
      const mockOperation = jest.fn().mockImplementation(() => {
        return Promise.reject(new Error('Test error'));
      });

      // Mock setTimeout to capture delays
      const originalSetTimeout = setTimeout;
      jest.spyOn(global, 'setTimeout').mockImplementation((callback: any, delay?: number) => {
        delays.push(delay || 0);
        return originalSetTimeout(callback, 0) as any; // Execute immediately for test
      });

      try {
        await retryHandler.executeWithRetry(mockOperation);
      } catch (error) {
        // Expected to fail after retries
      }

      // Should have captured 3 delay values (for 3 retries)
      expect(delays).toHaveLength(3);
      
      // Each delay should be roughly double the previous (exponential backoff)
      // Allow some variance due to jitter
      expect(delays[1]).toBeGreaterThan(delays[0] * 1.8);
      expect(delays[2]).toBeGreaterThan(delays[1] * 1.8);

      // Restore setTimeout
      jest.restoreAllMocks();
    });
  });
});
