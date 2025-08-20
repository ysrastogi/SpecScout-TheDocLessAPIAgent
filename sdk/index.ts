import axios, { AxiosInstance, AxiosResponse, AxiosError } from 'axios';
import { 
  GitHubClientConfig, 
  ApiResponse, 
  RateLimitInfo, 
  GitHubRepository,
  GitHubIssue,
  GitHubUser,
  PaginatorConfig,
  RetryableError
} from './types';
import { RetryHandler } from './retry';
import { Paginator, createPaginator } from './paginator';

export class GitHubClient {
  private axios: AxiosInstance;
  private retryHandler: RetryHandler;
  private config: Required<GitHubClientConfig>;

  constructor(config: GitHubClientConfig) {
    this.config = {
      baseUrl: 'https://api.github.com',
      timeout: 30000,
      maxRetries: 3,
      userAgent: 'DoclessApiAgent/1.0',
      ...config
    };

    this.axios = axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      headers: {
        'Authorization': `token ${this.config.token}`,
        'User-Agent': this.config.userAgent,
        'Accept': 'application/vnd.github.v3+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });

    this.retryHandler = new RetryHandler({
      maxRetries: this.config.maxRetries,
      retryOnStatus: [429, 500, 502, 503, 504]
    });

    // Add request/response interceptors for logging and error handling
    this.setupInterceptors();
  }

  /**
   * Make a raw HTTP request to the GitHub API
   */
  async request<T>(endpoint: string, options: any = {}): Promise<ApiResponse<T>> {
    return this.retryHandler.executeWithRetry(async () => {
      try {
        const response: AxiosResponse<T> = await this.axios.request({
          url: endpoint,
          ...options
        });

        return this.transformResponse(response);
      } catch (error) {
        throw this.transformError(error as AxiosError);
      }
    }, endpoint);
  }

  /**
   * Get user repositories
   */
  async getRepositories(username?: string, options: PaginatorConfig = {}): Promise<Paginator<GitHubRepository>> {
    const endpoint = username ? `/users/${username}/repos` : '/user/repos';
    
    return createPaginator<GitHubRepository>(
      endpoint,
      {
        per_page: 100,
        sort: 'updated',
        direction: 'desc',
        ...options
      },
      (url) => this.request<GitHubRepository[]>(url)
    );
  }

  /**
   * Get repository issues
   */
  async getIssues(
    owner: string, 
    repo: string, 
    options: PaginatorConfig = {}
  ): Promise<Paginator<GitHubIssue>> {
    const endpoint = `/repos/${owner}/${repo}/issues`;
    
    return createPaginator<GitHubIssue>(
      endpoint,
      {
        per_page: 100,
        sort: 'updated',
        direction: 'desc',
        ...options
      },
      (url) => this.request<GitHubIssue[]>(url)
    );
  }

  /**
   * Get a single user
   */
  async getUser(username?: string): Promise<GitHubUser> {
    const endpoint = username ? `/users/${username}` : '/user';
    const response = await this.request<GitHubUser>(endpoint);
    return response.data;
  }

  /**
   * Get a single repository
   */
  async getRepository(owner: string, repo: string): Promise<GitHubRepository> {
    const endpoint = `/repos/${owner}/${repo}`;
    const response = await this.request<GitHubRepository>(endpoint);
    return response.data;
  }

  /**
   * Search repositories
   */
  async searchRepositories(
    query: string, 
    options: PaginatorConfig = {}
  ): Promise<Paginator<GitHubRepository>> {
    const endpoint = '/search/repositories';
    
    return createPaginator<GitHubRepository>(
      endpoint,
      {
        per_page: 100,
        sort: 'stars' as any,
        direction: 'desc',
        ...options
      },
      (url) => {
        // For search endpoints, we need to modify the URL to include the query
        const searchUrl = url.includes('q=') ? url : `${url}${url.includes('?') ? '&' : '?'}q=${encodeURIComponent(query)}`;
        return this.request<{ items: GitHubRepository[] }>(searchUrl)
          .then(response => ({
            ...response,
            data: response.data.items // Extract items from search response
          }));
      }
    );
  }

  /**
   * Get current rate limit status
   */
  async getRateLimit(): Promise<RateLimitInfo> {
    const response = await this.request<{
      rate: {
        limit: number;
        remaining: number;
        reset: number;
        used: number;
      };
    }>('/rate_limit');

    return {
      limit: response.data.rate.limit,
      remaining: response.data.rate.remaining,
      reset: response.data.rate.reset,
      used: response.data.rate.used
    };
  }

  /**
   * Create a paginator for any endpoint
   */
  paginate<T>(endpoint: string, options: PaginatorConfig = {}): Paginator<T> {
    return createPaginator<T>(
      endpoint,
      options,
      (url) => this.request<T[]>(url)
    );
  }

  private setupInterceptors(): void {
    // Request interceptor for logging
    this.axios.interceptors.request.use((config: any) => {
      console.log(`🚀 ${config.method?.toUpperCase()} ${config.url}`);
      return config;
    });

    // Response interceptor for logging
    this.axios.interceptors.response.use(
      (response: any) => {
        const rateLimit = this.extractRateLimitInfo(response.headers);
        console.log(`✅ ${response.status} ${response.config.url} (${rateLimit.remaining}/${rateLimit.limit} remaining)`);
        return response;
      },
      (error: any) => {
        if (error.response) {
          const rateLimit = this.extractRateLimitInfo(error.response.headers);
          console.log(`❌ ${error.response.status} ${error.config?.url} (${rateLimit.remaining}/${rateLimit.limit} remaining)`);
        }
        return Promise.reject(error);
      }
    );
  }

  private transformResponse<T>(response: AxiosResponse<T>): ApiResponse<T> {
    return {
      data: response.data,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers as Record<string, string>,
      rate_limit: this.extractRateLimitInfo(response.headers)
    };
  }

  private transformError(error: AxiosError): RetryableError {
    const status = error.response?.status;
    const retryAfter = error.response?.headers['retry-after'];
    
    let message = error.message;
    if (error.response?.data && typeof error.response.data === 'object') {
      const apiError = error.response.data as any;
      if (apiError.message) {
        message = apiError.message;
      }
    }

    const retryableError = new Error(message) as RetryableError;
    retryableError.status = status;
    retryableError.isRetryable = this.isRetryableStatus(status);
    
    if (retryAfter) {
      retryableError.retryAfter = RetryHandler.parseRetryAfter(retryAfter);
    }

    return retryableError;
  }

  private isRetryableStatus(status?: number): boolean {
    if (!status) return true; // Network errors
    return [429, 500, 502, 503, 504].includes(status);
  }

  private extractRateLimitInfo(headers: any): RateLimitInfo {
    return {
      limit: parseInt(headers['x-ratelimit-limit'] || '5000', 10),
      remaining: parseInt(headers['x-ratelimit-remaining'] || '5000', 10),
      reset: parseInt(headers['x-ratelimit-reset'] || Math.floor(Date.now() / 1000 + 3600).toString(), 10),
      used: parseInt(headers['x-ratelimit-used'] || '0', 10),
      retry_after: headers['retry-after'] ? parseInt(headers['retry-after'], 10) : undefined
    };
  }
}

// Export main client and types for easy consumption
export * from './types';
export * from './paginator';
export * from './retry';
