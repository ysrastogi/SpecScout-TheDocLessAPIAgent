import { GitHubClient } from '../sdk';
import { Paginator } from '../sdk/paginator';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

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
mockedAxios.create.mockReturnValue(mockAxiosInstance as any);

describe('GitHubClient', () => {
  let client: GitHubClient;
  const mockToken = 'test-token';

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    client = new GitHubClient({
      token: mockToken,
      baseUrl: 'https://api.github.com'
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default configuration', () => {
      const defaultClient = new GitHubClient({ token: mockToken });
      expect(defaultClient).toBeDefined();
    });

    it('should accept custom configuration', () => {
      const customClient = new GitHubClient({
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
      expect(paginator).toBeInstanceOf(Paginator);
    });

    it('should return a paginator for specific user repositories', async () => {
      const paginator = await client.getRepositories('octocat');
      expect(paginator).toBeInstanceOf(Paginator);
    });

    it('should accept pagination options', async () => {
      const options = {
        per_page: 50,
        sort: 'updated' as const,
        direction: 'desc' as const
      };
      const paginator = await client.getRepositories('octocat', options);
      expect(paginator).toBeInstanceOf(Paginator);
    });
  });

  describe('getIssues', () => {
    it('should return a paginator for repository issues', async () => {
      const paginator = await client.getIssues('owner', 'repo');
      expect(paginator).toBeInstanceOf(Paginator);
    });

    it('should accept pagination options', async () => {
      const options = {
        per_page: 100,
        sort: 'updated' as const,
        direction: 'desc' as const,
        checkpointFile: './test-checkpoint.json'
      };
      const paginator = await client.getIssues('owner', 'repo', options);
      expect(paginator).toBeInstanceOf(Paginator);
    });
  });

  describe('searchRepositories', () => {
    it('should return a paginator for search results', async () => {
      const paginator = await client.searchRepositories('javascript');
      expect(paginator).toBeInstanceOf(Paginator);
    });

    it('should accept search options', async () => {
      const options = {
        per_page: 50,
        sort: 'stars' as const,
        direction: 'desc' as const
      };
      const paginator = await client.searchRepositories('javascript', options);
      expect(paginator).toBeInstanceOf(Paginator);
    });
  });

  describe('paginate', () => {
    it('should create a paginator for any endpoint', () => {
      const paginator = client.paginate('/custom/endpoint');
      expect(paginator).toBeInstanceOf(Paginator);
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
      expect(paginator).toBeInstanceOf(Paginator);
    });
  });
});
