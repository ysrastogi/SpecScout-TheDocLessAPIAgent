const express = require('express');
const { Provider } = require('oidc-provider');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3003;
const ISSUER = process.env.ISSUER_URL || `http://localhost:${PORT}`;

// Simple in-memory store for demo purposes
const clients = new Map();
const authorizationCodes = new Map();
const accessTokens = new Map();
const users = new Map([
  ['demo-user', {
    id: 'demo-user',
    email: 'demo@example.com',
    name: 'Demo User',
    password: 'demo-password' // In production, hash this!
  }]
]);

// PKCE utilities
const base64URLEncode = (str) => {
  return str.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
};

const sha256 = (buffer) => {
  return crypto.createHash('sha256').update(buffer).digest();
};

// Initialize OAuth2 provider configuration
const configuration = {
  clients: [{
    client_id: 'demo-client',
    client_secret: 'demo-client-secret',
    redirect_uris: ['http://localhost:3000/callback', 'https://oauth.pstmn.io/v1/callback'],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    scope: 'openid profile email'
  }],
  cookies: {
    keys: ['some-secret-key-for-demo']
  },
  features: {
    pkce: {
      methods: ['S256'],
      required: () => true // Require PKCE for all clients
    },
    devInteractions: { enabled: false } // Disable dev interactions, we'll handle our own
  },
  ttl: {
    AuthorizationCode: 600, // 10 minutes
    AccessToken: 3600, // 1 hour
    RefreshToken: 86400 // 24 hours
  },
  findAccount: async (ctx, id) => {
    const user = users.get(id);
    if (!user) return undefined;
    
    return {
      accountId: id,
      async claims() {
        return {
          sub: id,
          email: user.email,
          name: user.name,
          email_verified: true
        };
      }
    };
  }
};

// Create OIDC Provider instance
const oidc = new Provider(ISSUER, configuration);

// Custom interaction handling (login/consent)
oidc.use(async (ctx, next) => {
  ctx.set('Access-Control-Allow-Origin', '*');
  ctx.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  ctx.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (ctx.method === 'OPTIONS') {
    ctx.status = 204;
    return;
  }
  
  await next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'oauth2-server',
    issuer: ISSUER,
    timestamp: new Date().toISOString()
  });
});

// Demo login page (simplified)
app.get('/auth/login', async (req, res) => {
  const { uid } = req.query;
  
  if (!uid) {
    return res.status(400).json({ error: 'Missing interaction uid' });
  }

  // In a real app, show a proper login form
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>OAuth2 Demo Login</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 400px; margin: 50px auto; padding: 20px; }
        .form-group { margin-bottom: 15px; }
        input { width: 100%; padding: 8px; margin-top: 5px; }
        button { background: #007cba; color: white; padding: 10px 20px; border: none; cursor: pointer; }
        button:hover { background: #005a8b; }
        .demo-info { background: #f0f8ff; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
      </style>
    </head>
    <body>
      <div class="demo-info">
        <h3>Demo OAuth2 Server</h3>
        <p>This is a demonstration OAuth2/OIDC server with PKCE support.</p>
        <p><strong>Demo credentials:</strong></p>
        <ul>
          <li>Username: demo-user</li>
          <li>Password: demo-password</li>
        </ul>
      </div>
      
      <h2>Login</h2>
      <form method="post" action="/auth/login">
        <input type="hidden" name="uid" value="${uid}">
        <div class="form-group">
          <label>Username:</label>
          <input type="text" name="username" value="demo-user" required>
        </div>
        <div class="form-group">
          <label>Password:</label>
          <input type="password" name="password" value="demo-password" required>
        </div>
        <button type="submit">Login</button>
      </form>
    </body>
    </html>
  `);
});

// Handle login form submission
app.post('/auth/login', express.urlencoded({ extended: false }), async (req, res) => {
  const { uid, username, password } = req.body;
  
  try {
    const interaction = await oidc.Interaction.find(uid);
    const { prompt, params } = interaction;
    
    // Verify credentials
    const user = users.get(username);
    if (!user || user.password !== password) {
      return res.send(`
        <html><body>
          <h2>Login Failed</h2>
          <p>Invalid username or password.</p>
          <a href="/auth/login?uid=${uid}">Try again</a>
        </body></html>
      `);
    }

    const result = {
      login: {
        accountId: username,
      }
    };

    await interaction.finished(result);
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// PKCE authorization endpoint demo
app.get('/demo/pkce', (req, res) => {
  // Generate PKCE values for demo
  const codeVerifier = base64URLEncode(crypto.randomBytes(32));
  const codeChallenge = base64URLEncode(sha256(codeVerifier));
  
  const authUrl = new URL('/auth', ISSUER);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', 'demo-client');
  authUrl.searchParams.set('redirect_uri', 'http://localhost:3000/callback');
  authUrl.searchParams.set('scope', 'openid profile email');
  authUrl.searchParams.set('state', 'demo-state-' + crypto.randomBytes(8).toString('hex'));
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  res.json({
    message: 'OAuth2 PKCE Flow Demo',
    instructions: [
      '1. Use the authorization URL to start the flow',
      '2. User will be redirected to login page',
      '3. After login, authorization code will be sent to redirect_uri',
      '4. Exchange the code for tokens using the code_verifier'
    ],
    pkce_values: {
      code_verifier: codeVerifier,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    },
    authorization_url: authUrl.toString(),
    token_endpoint: `${ISSUER}/token`,
    userinfo_endpoint: `${ISSUER}/me`,
    well_known_endpoint: `${ISSUER}/.well-known/openid_configuration`,
    demo_client: {
      client_id: 'demo-client',
      client_secret: 'demo-client-secret',
      redirect_uris: ['http://localhost:3000/callback', 'https://oauth.pstmn.io/v1/callback']
    },
    example_token_request: {
      method: 'POST',
      url: `${ISSUER}/token`,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: [
        'grant_type=authorization_code',
        'client_id=demo-client',
        'client_secret=demo-client-secret',
        'code=AUTHORIZATION_CODE_FROM_CALLBACK',
        `code_verifier=${codeVerifier}`,
        'redirect_uri=http://localhost:3000/callback'
      ].join('&')
    }
  });
});

// Token introspection endpoint (for debugging)
app.get('/debug/token/:token', async (req, res) => {
  const { token } = req.params;
  
  try {
    // In a real implementation, you'd validate and decode the token properly
    const decoded = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    
    res.json({
      message: 'Token debug info (demo only - never expose in production)',
      decoded_payload: decoded,
      is_expired: decoded.exp < (Date.now() / 1000),
      issued_at: new Date(decoded.iat * 1000).toISOString(),
      expires_at: new Date(decoded.exp * 1000).toISOString()
    });
  } catch (error) {
    res.status(400).json({
      error: 'invalid_token',
      message: 'Could not decode token'
    });
  }
});

// Mount the OIDC provider
app.use('/', oidc.callback());

// Error handling
app.use((error, req, res, next) => {
  console.error('OAuth2 server error:', error);
  res.status(500).json({
    error: 'server_error',
    message: 'Internal server error'
  });
});

app.listen(PORT, () => {
  console.log(`🔐 OAuth2/OIDC Server running on port ${PORT}`);
  console.log(`🌐 Issuer URL: ${ISSUER}`);
  console.log(`📚 PKCE Demo: http://localhost:${PORT}/demo/pkce`);
  console.log(`🔍 Well-known config: ${ISSUER}/.well-known/openid_configuration`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
});
