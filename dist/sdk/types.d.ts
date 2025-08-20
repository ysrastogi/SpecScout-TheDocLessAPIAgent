export interface GitHubRepository {
    id: number;
    name: string;
    full_name: string;
    description: string | null;
    private: boolean;
    html_url: string;
    clone_url: string;
    ssh_url: string;
    stargazers_count: number;
    watchers_count: number;
    forks_count: number;
    language: string | null;
    created_at: string;
    updated_at: string;
    pushed_at: string;
    size: number;
    default_branch: string;
    topics: string[];
    archived: boolean;
    disabled: boolean;
    visibility: 'public' | 'private' | 'internal';
    owner: GitHubUser;
}
export interface GitHubUser {
    id: number;
    login: string;
    avatar_url: string;
    html_url: string;
    type: 'User' | 'Organization';
    site_admin: boolean;
    name?: string | null;
    company?: string | null;
    blog?: string | null;
    location?: string | null;
    email?: string | null;
    hireable?: boolean | null;
    bio?: string | null;
    public_repos?: number;
    public_gists?: number;
    followers?: number;
    following?: number;
    created_at?: string;
    updated_at?: string;
}
export interface GitHubIssue {
    id: number;
    number: number;
    title: string;
    body: string | null;
    user: GitHubUser;
    labels: GitHubLabel[];
    state: 'open' | 'closed';
    assignee: GitHubUser | null;
    assignees: GitHubUser[];
    milestone: GitHubMilestone | null;
    comments: number;
    created_at: string;
    updated_at: string;
    closed_at: string | null;
    html_url: string;
    repository_url: string;
}
export interface GitHubLabel {
    id: number;
    name: string;
    color: string;
    description: string | null;
    default: boolean;
}
export interface GitHubMilestone {
    id: number;
    number: number;
    title: string;
    description: string | null;
    state: 'open' | 'closed';
    created_at: string;
    updated_at: string;
    due_on: string | null;
    closed_at: string | null;
}
export interface GitHubClientConfig {
    token: string;
    baseUrl?: string;
    timeout?: number;
    maxRetries?: number;
    userAgent?: string;
}
export interface PaginationOptions {
    page?: number;
    per_page?: number;
    since?: string;
    until?: string;
    sort?: 'created' | 'updated' | 'pushed' | 'full_name' | 'stars';
    direction?: 'asc' | 'desc';
}
export interface CheckpointOptions {
    checkpointFile?: string;
    saveInterval?: number;
    resumeFromCheckpoint?: boolean;
}
export interface RetryConfig {
    maxRetries: number;
    baseDelay: number;
    maxDelay: number;
    jitterFactor: number;
    retryOnStatus: number[];
    respectRetryAfter: boolean;
}
export interface PaginationInfo {
    page: number;
    per_page: number;
    total?: number;
    has_next: boolean;
    has_prev: boolean;
    next_url?: string;
    prev_url?: string;
    first_url?: string;
    last_url?: string;
}
export interface PaginatedResponse<T> {
    data: T[];
    pagination: PaginationInfo;
    rate_limit: RateLimitInfo;
}
export interface RateLimitInfo {
    limit: number;
    remaining: number;
    reset: number;
    used: number;
    retry_after?: number;
}
export interface Checkpoint {
    endpoint: string;
    page: number;
    per_page: number;
    total_processed: number;
    last_item_id?: string | number;
    timestamp: string;
    options: Record<string, any>;
}
export interface GitHubApiError {
    message: string;
    documentation_url?: string;
    errors?: Array<{
        resource: string;
        field: string;
        code: string;
    }>;
}
export interface RetryableError extends Error {
    status?: number;
    retryAfter?: number;
    isRetryable: boolean;
}
export interface ApiResponse<T> {
    data: T;
    status: number;
    statusText: string;
    headers: Record<string, string>;
    rate_limit: RateLimitInfo;
}
export interface PaginatorConfig extends PaginationOptions, CheckpointOptions {
    retryConfig?: Partial<RetryConfig>;
    deduplication?: {
        enabled: boolean;
        keyField: string;
    };
}
export type PaginatorAsyncIterator<T> = AsyncIterableIterator<T> & {
    getInfo(): PaginationInfo;
    saveCheckpoint(): Promise<void>;
    loadCheckpoint(): Promise<Checkpoint | null>;
    getTotalProcessed(): number;
};
//# sourceMappingURL=types.d.ts.map