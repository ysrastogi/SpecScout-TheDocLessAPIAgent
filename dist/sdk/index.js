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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitHubClient = void 0;
const axios_1 = __importDefault(require("axios"));
const retry_1 = require("./retry");
const paginator_1 = require("./paginator");
class GitHubClient {
    constructor(config) {
        this.config = {
            baseUrl: 'https://api.github.com',
            timeout: 30000,
            maxRetries: 3,
            userAgent: 'DoclessApiAgent/1.0',
            ...config
        };
        this.axios = axios_1.default.create({
            baseURL: this.config.baseUrl,
            timeout: this.config.timeout,
            headers: {
                'Authorization': `token ${this.config.token}`,
                'User-Agent': this.config.userAgent,
                'Accept': 'application/vnd.github.v3+json',
                'X-GitHub-Api-Version': '2022-11-28'
            }
        });
        this.retryHandler = new retry_1.RetryHandler({
            maxRetries: this.config.maxRetries,
            retryOnStatus: [429, 500, 502, 503, 504]
        });
        // Add request/response interceptors for logging and error handling
        this.setupInterceptors();
    }
    /**
     * Make a raw HTTP request to the GitHub API
     */
    async request(endpoint, options = {}) {
        return this.retryHandler.executeWithRetry(async () => {
            try {
                const response = await this.axios.request({
                    url: endpoint,
                    ...options
                });
                return this.transformResponse(response);
            }
            catch (error) {
                throw this.transformError(error);
            }
        }, endpoint);
    }
    /**
     * Get user repositories
     */
    async getRepositories(username, options = {}) {
        const endpoint = username ? `/users/${username}/repos` : '/user/repos';
        return (0, paginator_1.createPaginator)(endpoint, {
            per_page: 100,
            sort: 'updated',
            direction: 'desc',
            ...options
        }, (url) => this.request(url));
    }
    /**
     * Get repository issues
     */
    async getIssues(owner, repo, options = {}) {
        const endpoint = `/repos/${owner}/${repo}/issues`;
        return (0, paginator_1.createPaginator)(endpoint, {
            per_page: 100,
            sort: 'updated',
            direction: 'desc',
            ...options
        }, (url) => this.request(url));
    }
    /**
     * Get a single user
     */
    async getUser(username) {
        const endpoint = username ? `/users/${username}` : '/user';
        const response = await this.request(endpoint);
        return response.data;
    }
    /**
     * Get a single repository
     */
    async getRepository(owner, repo) {
        const endpoint = `/repos/${owner}/${repo}`;
        const response = await this.request(endpoint);
        return response.data;
    }
    /**
     * Search repositories
     */
    async searchRepositories(query, options = {}) {
        const endpoint = '/search/repositories';
        return (0, paginator_1.createPaginator)(endpoint, {
            per_page: 100,
            sort: 'stars',
            direction: 'desc',
            ...options
        }, (url) => {
            // For search endpoints, we need to modify the URL to include the query
            const searchUrl = url.includes('q=') ? url : `${url}${url.includes('?') ? '&' : '?'}q=${encodeURIComponent(query)}`;
            return this.request(searchUrl)
                .then(response => ({
                ...response,
                data: response.data.items // Extract items from search response
            }));
        });
    }
    /**
     * Get current rate limit status
     */
    async getRateLimit() {
        const response = await this.request('/rate_limit');
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
    paginate(endpoint, options = {}) {
        return (0, paginator_1.createPaginator)(endpoint, options, (url) => this.request(url));
    }
    setupInterceptors() {
        // Request interceptor for logging
        this.axios.interceptors.request.use((config) => {
            console.log(`🚀 ${config.method?.toUpperCase()} ${config.url}`);
            return config;
        });
        // Response interceptor for logging
        this.axios.interceptors.response.use((response) => {
            const rateLimit = this.extractRateLimitInfo(response.headers);
            console.log(`✅ ${response.status} ${response.config.url} (${rateLimit.remaining}/${rateLimit.limit} remaining)`);
            return response;
        }, (error) => {
            if (error.response) {
                const rateLimit = this.extractRateLimitInfo(error.response.headers);
                console.log(`❌ ${error.response.status} ${error.config?.url} (${rateLimit.remaining}/${rateLimit.limit} remaining)`);
            }
            return Promise.reject(error);
        });
    }
    transformResponse(response) {
        return {
            data: response.data,
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
            rate_limit: this.extractRateLimitInfo(response.headers)
        };
    }
    transformError(error) {
        const status = error.response?.status;
        const retryAfter = error.response?.headers['retry-after'];
        let message = error.message;
        if (error.response?.data && typeof error.response.data === 'object') {
            const apiError = error.response.data;
            if (apiError.message) {
                message = apiError.message;
            }
        }
        const retryableError = new Error(message);
        retryableError.status = status;
        retryableError.isRetryable = this.isRetryableStatus(status);
        if (retryAfter) {
            retryableError.retryAfter = retry_1.RetryHandler.parseRetryAfter(retryAfter);
        }
        return retryableError;
    }
    isRetryableStatus(status) {
        if (!status)
            return true; // Network errors
        return [429, 500, 502, 503, 504].includes(status);
    }
    extractRateLimitInfo(headers) {
        return {
            limit: parseInt(headers['x-ratelimit-limit'] || '5000', 10),
            remaining: parseInt(headers['x-ratelimit-remaining'] || '5000', 10),
            reset: parseInt(headers['x-ratelimit-reset'] || Math.floor(Date.now() / 1000 + 3600).toString(), 10),
            used: parseInt(headers['x-ratelimit-used'] || '0', 10),
            retry_after: headers['retry-after'] ? parseInt(headers['retry-after'], 10) : undefined
        };
    }
}
exports.GitHubClient = GitHubClient;
// Export main client and types for easy consumption
__exportStar(require("./types"), exports);
__exportStar(require("./paginator"), exports);
__exportStar(require("./retry"), exports);
//# sourceMappingURL=index.js.map