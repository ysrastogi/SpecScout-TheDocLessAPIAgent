"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sdk_1 = require("../sdk");
const paginator_1 = require("../sdk/paginator");
const axios_1 = __importDefault(require("axios"));
// Mock axios
jest.mock('axios');
const mockedAxios = axios_1.default;
// Create a mock axios instance
const mockAxiosInstance = {
    interceptors: {
        request: {
            use: jest.fn()
        },
        response: {
            use: jest.fn()
        }
    },
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    request: jest.fn()
};
// Make axios.create return our mock instance
mockedAxios.create.mockReturnValue(mockAxiosInstance);
describe('GitHubClient', () => {
    let client;
    const mockToken = 'test-token';
    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();
        client = new sdk_1.GitHubClient({
            token: mockToken,
            baseUrl: 'https://api.github.com'
        });
    });
    afterEach(() => {
        jest.clearAllMocks();
    });
    describe('constructor', () => {
        it('should initialize with default configuration', () => {
            const defaultClient = new sdk_1.GitHubClient({ token: mockToken });
            expect(defaultClient).toBeDefined();
        });
        it('should accept custom configuration', () => {
            const customClient = new sdk_1.GitHubClient({
                token: mockToken,
                baseUrl: 'https://api.custom.com',
                timeout: 60000,
                maxRetries: 5,
                userAgent: 'CustomAgent/1.0'
            });
            expect(customClient).toBeDefined();
        });
    });
    describe('getRepositories', () => {
        it('should return a paginator for user repositories', async () => {
            const paginator = await client.getRepositories();
            expect(paginator).toBeInstanceOf(paginator_1.Paginator);
        });
        it('should return a paginator for specific user repositories', async () => {
            const paginator = await client.getRepositories('octocat');
            expect(paginator).toBeInstanceOf(paginator_1.Paginator);
        });
        it('should accept pagination options', async () => {
            const options = {
                per_page: 50,
                sort: 'updated',
                direction: 'desc'
            };
            const paginator = await client.getRepositories('octocat', options);
            expect(paginator).toBeInstanceOf(paginator_1.Paginator);
        });
    });
    describe('getIssues', () => {
        it('should return a paginator for repository issues', async () => {
            const paginator = await client.getIssues('owner', 'repo');
            expect(paginator).toBeInstanceOf(paginator_1.Paginator);
        });
        it('should accept pagination options', async () => {
            const options = {
                per_page: 100,
                sort: 'updated',
                direction: 'desc',
                checkpointFile: './test-checkpoint.json'
            };
            const paginator = await client.getIssues('owner', 'repo', options);
            expect(paginator).toBeInstanceOf(paginator_1.Paginator);
        });
    });
    describe('searchRepositories', () => {
        it('should return a paginator for search results', async () => {
            const paginator = await client.searchRepositories('javascript');
            expect(paginator).toBeInstanceOf(paginator_1.Paginator);
        });
        it('should accept search options', async () => {
            const options = {
                per_page: 50,
                sort: 'stars',
                direction: 'desc'
            };
            const paginator = await client.searchRepositories('javascript', options);
            expect(paginator).toBeInstanceOf(paginator_1.Paginator);
        });
    });
    describe('paginate', () => {
        it('should create a paginator for any endpoint', () => {
            const paginator = client.paginate('/custom/endpoint');
            expect(paginator).toBeInstanceOf(paginator_1.Paginator);
        });
        it('should accept configuration options', () => {
            const options = {
                per_page: 75,
                deduplication: {
                    enabled: true,
                    keyField: 'id'
                }
            };
            const paginator = client.paginate('/custom/endpoint', options);
            expect(paginator).toBeInstanceOf(paginator_1.Paginator);
        });
    });
});
//# sourceMappingURL=github-client.test.js.map