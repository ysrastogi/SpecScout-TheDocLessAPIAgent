# Doc-less API Agent Demo

A comprehensive demonstration of reverse-engineering APIs without documentation using the GitHub REST API as a case study.

## 🎯 Overview

This project showcases how to:
- Reverse-engineer API specifications through observation
- Handle pagination patterns and rate limiting
- Build robust SDKs with retry logic and checkpointing
- Create comprehensive testing strategies
- Mock complex API behaviors locally

## 🚀 Features

### ✅ OpenAPI 3.1 Specification
- Auto-generated spec from real GitHub API observations
- Complete schema definitions with examples
- Pagination and rate-limiting documentation

### 🛠 TypeScript SDK
- **Unified Paginator**: Handles GitHub's page-based pagination
- **Smart Retry Logic**: Exponential backoff with jitter, respects `Retry-After` headers
- **Checkpointing**: Resume interrupted operations
- **Deduplication**: Avoid processing duplicate data
- **Type Safety**: Full TypeScript support

### 📮 Postman Integration
- Ready-to-use collection with GitHub endpoints
- Environment variables for authentication
- Pagination examples and rate limit testing

### 🧪 Mock Lab
Local Docker environment simulating:
- **Payment Service**: Idempotency-Key support
- **Webhook Service**: HMAC signature verification
- **OAuth2 Server**: PKCE flow implementation

### 🧪 Comprehensive Testing
- Jest unit tests for all SDK components
- Newman integration for Postman collection testing
- GitHub Actions CI pipeline

## 📦 Quick Start

```bash
# Install dependencies
npm install

# Start development
npm run dev

# Run tests
npm test

# Start mock services
npm run docker:up

# Generate OpenAPI spec
npm run generate:openapi
```

## 🏗 Project Structure

```
docless-api-agent-demo/
├── openapi.yaml              # Generated OpenAPI 3.1 spec
├── sdk/                      # TypeScript SDK
│   ├── index.ts             # Main client
│   ├── paginator.ts         # Pagination logic
│   ├── types.ts             # TypeScript definitions
│   └── retry.ts             # Retry mechanisms
├── postman_collection.json   # Postman collection
├── evidence.md              # API behavior documentation
├── mock-lab/                # Docker mock services
│   ├── docker-compose.yml
│   ├── express-webhook.js
│   ├── oauth2-server.js
│   └── idempotency-demo.js
├── tests/                   # Test suites
└── README.md
```

## 🔧 Configuration

Create a `.env` file:

```env
GITHUB_TOKEN=your_github_personal_access_token
GITHUB_API_BASE_URL=https://api.github.com
```

## 📖 Usage Examples

### Basic Repository Listing
```typescript
import { GitHubClient } from './sdk';

const client = new GitHubClient({
  token: process.env.GITHUB_TOKEN
});

// Get all repos with automatic pagination
for await (const repo of client.paginate('/user/repos')) {
  console.log(`${repo.name}: ${repo.stargazers_count} stars`);
}
```

### With Checkpointing
```typescript
// Resume from where you left off
const paginator = client.createPaginator('/user/repos', {
  per_page: 100,
  checkpoint: './last_checkpoint.json'
});

for await (const repo of paginator) {
  // Process repo...
  paginator.saveCheckpoint(); // Save progress
}
```

## 🎯 Key Learnings Demonstrated

1. **Pagination Patterns**: GitHub uses page-based pagination with `page` and `per_page` parameters
2. **Rate Limiting**: 429 responses include `Retry-After` headers for backoff timing
3. **Authentication**: Bearer token in Authorization header
4. **Error Handling**: Comprehensive HTTP status code handling
5. **API Reliability**: Implementing retry logic, timeouts, and circuit breakers

## 🤝 Contributing

This is a demonstration project showing API reverse-engineering techniques. Feel free to explore and learn from the patterns implemented here.

## 📄 License

MIT License - feel free to use this as a learning resource or starting point for your own projects.
