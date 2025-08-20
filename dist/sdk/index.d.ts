import { GitHubClientConfig, ApiResponse, RateLimitInfo, GitHubRepository, GitHubIssue, GitHubUser, PaginatorConfig } from './types';
import { Paginator } from './paginator';
export declare class GitHubClient {
    private axios;
    private retryHandler;
    private config;
    constructor(config: GitHubClientConfig);
    /**
     * Make a raw HTTP request to the GitHub API
     */
    request<T>(endpoint: string, options?: any): Promise<ApiResponse<T>>;
    /**
     * Get user repositories
     */
    getRepositories(username?: string, options?: PaginatorConfig): Promise<Paginator<GitHubRepository>>;
    /**
     * Get repository issues
     */
    getIssues(owner: string, repo: string, options?: PaginatorConfig): Promise<Paginator<GitHubIssue>>;
    /**
     * Get a single user
     */
    getUser(username?: string): Promise<GitHubUser>;
    /**
     * Get a single repository
     */
    getRepository(owner: string, repo: string): Promise<GitHubRepository>;
    /**
     * Search repositories
     */
    searchRepositories(query: string, options?: PaginatorConfig): Promise<Paginator<GitHubRepository>>;
    /**
     * Get current rate limit status
     */
    getRateLimit(): Promise<RateLimitInfo>;
    /**
     * Create a paginator for any endpoint
     */
    paginate<T>(endpoint: string, options?: PaginatorConfig): Paginator<T>;
    private setupInterceptors;
    private transformResponse;
    private transformError;
    private isRetryableStatus;
    private extractRateLimitInfo;
}
export * from './types';
export * from './paginator';
export * from './retry';
//# sourceMappingURL=index.d.ts.map