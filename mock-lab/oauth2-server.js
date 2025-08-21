const express = require('express');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3003;
const ISSUER = process.env.ISSUER_URL || `http://localhost:${PORT}`;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.status(204).send();
  }
  next();
});

// Simple in-memory store for demo purposes
const clients = new Map();
const authCodes = new Map();
const tokens = new Map();

// Initialize demo client
clients.set('demo-client', {
  client_id: 'demo-client',
  client_secret: 'demo-secret',
  redirect_uris: ['http://localhost:3000/callback', 'http://localhost:8080/callback'],
  grant_types: ['authorization_code', 'refresh_token'],
  response_types: ['code'],
  scope: 'openid profile email'
});

// Utility functions
function base64URLEscape(str) {
  return str.replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
}

function generateToken(payload) {
  const header = {
    typ: 'JWT',
    alg: 'HS256'
  };
  
  const headerEncoded = base64URLEscape(Buffer.from(JSON.stringify(header)).toString('base64'));
  const payloadEncoded = base64URLEscape(Buffer.from(JSON.stringify(payload)).toString('base64'));
  
  const signature = crypto
    .createHmac('sha256', 'demo-secret')
    .update(`${headerEncoded}.${payloadEncoded}`)
    .digest('base64');
  const signatureEncoded = base64URLEscape(signature);
  
  return `${headerEncoded}.${payloadEncoded}.${signatureEncoded}`;
}

// Health endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    service: 'oauth2-server',
    timestamp: new Date().toISOString()
  });
});

// OpenID Connect Discovery endpoint
app.get('/.well-known/openid_configuration', (req, res) => {
  res.json({
    issuer: ISSUER,
    authorization_endpoint: `${ISSUER}/auth`,
    token_endpoint: `${ISSUER}/token`,
    userinfo_endpoint: `${ISSUER}/userinfo`,
    jwks_uri: `${ISSUER}/jwks`,
    response_types_supported: ['code'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['HS256'],
    scopes_supported: ['openid', 'profile', 'email'],
    claims_supported: ['sub', 'name', 'email', 'given_name', 'family_name'],
    code_challenge_methods_supported: ['S256', 'plain'],
    grant_types_supported: ['authorization_code', 'refresh_token']
  });
});

// PKCE demo endpoint
app.get('/demo/pkce', (req, res) => {
  const codeVerifier = base64URLEscape(crypto.randomBytes(32).toString('base64'));
  const codeChallenge = base64URLEscape(crypto.createHash('sha256').update(codeVerifier).digest('base64'));
  
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
    userinfo_endpoint: `${ISSUER}/userinfo`
  });
});

// Authorization endpoint
app.get('/auth', (req, res) => {
  const {
    response_type,
    client_id,
    redirect_uri,
    scope,
    state,
    code_challenge,
    code_challenge_method
  } = req.query;

  // Validate client
  const client = clients.get(client_id);
  if (!client) {
    return res.status(400).json({ error: 'invalid_client' });
  }

  // Validate redirect URI
  if (!client.redirect_uris.includes(redirect_uri)) {
    return res.status(400).json({ error: 'invalid_redirect_uri' });
  }

  // Show login page
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
        <p>Client ID: <code>${client_id}</code></p>
        <p>Redirect URI: <code>${redirect_uri}</code></p>
        <p>Scope: <code>${scope}</code></p>
        <p>State: <code>${state || 'none'}</code></p>
      </div>
      
      <h2>Login</h2>
      <form method="post" action="/auth/login">
        <input type="hidden" name="client_id" value="${client_id}">
        <input type="hidden" name="redirect_uri" value="${redirect_uri}">
        <input type="hidden" name="scope" value="${scope}">
        <input type="hidden" name="state" value="${state || ''}">
        <input type="hidden" name="code_challenge" value="${code_challenge || ''}">
        <input type="hidden" name="code_challenge_method" value="${code_challenge_method || ''}">
        
        <div class="form-group">
          <label>Username:</label>
          <input type="text" name="username" value="demo@example.com" required>
        </div>
        <div class="form-group">
          <label>Password:</label>
          <input type="password" name="password" value="demo" required>
        </div>
        <button type="submit">Login</button>
      </form>
    </body>
    </html>
  `);
});

// Handle login
app.post('/auth/login', (req, res) => {
  const {
    username,
    password,
    client_id,
    redirect_uri,
    scope,
    state,
    code_challenge,
    code_challenge_method
  } = req.body;

  // Demo validation
  if (username !== 'demo@example.com' || password !== 'demo') {
    return res.status(400).send('<h2>Invalid credentials</h2><p>Use: demo@example.com / demo</p>');
  }

  // Generate authorization code
  const code = crypto.randomBytes(32).toString('hex');
  const authCodeData = {
    client_id,
    redirect_uri,
    scope,
    user_id: 'demo-user-123',
    code_challenge,
    code_challenge_method,
    expires_at: Date.now() + 600000 // 10 minutes
  };
  
  authCodes.set(code, authCodeData);

  // Redirect with authorization code
  const redirectUrl = new URL(redirect_uri);
  redirectUrl.searchParams.set('code', code);
  if (state) {
    redirectUrl.searchParams.set('state', state);
  }

  res.redirect(redirectUrl.toString());
});

// Token endpoint
app.post('/token', (req, res) => {
  const {
    grant_type,
    client_id,
    client_secret,
    code,
    redirect_uri,
    code_verifier
  } = req.body;

  if (grant_type !== 'authorization_code') {
    return res.status(400).json({ error: 'unsupported_grant_type' });
  }

  // Validate client
  const client = clients.get(client_id);
  if (!client || client.client_secret !== client_secret) {
    return res.status(400).json({ error: 'invalid_client' });
  }

  // Validate authorization code
  const authCodeData = authCodes.get(code);
  if (!authCodeData) {
    return res.status(400).json({ error: 'invalid_grant' });
  }

  if (authCodeData.expires_at < Date.now()) {
    authCodes.delete(code);
    return res.status(400).json({ error: 'invalid_grant' });
  }

  // Validate PKCE if present
  if (authCodeData.code_challenge && authCodeData.code_challenge_method === 'S256') {
    if (!code_verifier) {
      return res.status(400).json({ error: 'invalid_request' });
    }
    
    const challengeFromVerifier = base64URLEscape(
      crypto.createHash('sha256').update(code_verifier).digest('base64')
    );
    
    if (challengeFromVerifier !== authCodeData.code_challenge) {
      return res.status(400).json({ error: 'invalid_grant' });
    }
  }

  // Generate tokens
  const now = Math.floor(Date.now() / 1000);
  const accessTokenPayload = {
    sub: authCodeData.user_id,
    aud: client_id,
    iss: ISSUER,
    iat: now,
    exp: now + 3600, // 1 hour
    scope: authCodeData.scope
  };

  const idTokenPayload = {
    sub: authCodeData.user_id,
    aud: client_id,
    iss: ISSUER,
    iat: now,
    exp: now + 3600,
    email: 'demo@example.com',
    name: 'Demo User',
    given_name: 'Demo',
    family_name: 'User'
  };

  const accessToken = generateToken(accessTokenPayload);
  const idToken = generateToken(idTokenPayload);

  // Store token for userinfo endpoint
  tokens.set(accessToken, {
    user_id: authCodeData.user_id,
    scope: authCodeData.scope,
    expires_at: now + 3600
  });

  // Clean up authorization code
  authCodes.delete(code);

  res.json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: 3600,
    id_token: idToken,
    scope: authCodeData.scope
  });
});

// UserInfo endpoint
app.get('/userinfo', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'invalid_token' });
  }

  const accessToken = authHeader.substring(7);
  const tokenData = tokens.get(accessToken);
  
  if (!tokenData || tokenData.expires_at < Math.floor(Date.now() / 1000)) {
    return res.status(401).json({ error: 'invalid_token' });
  }

  res.json({
    sub: tokenData.user_id,
    email: 'demo@example.com',
    name: 'Demo User',
    given_name: 'Demo',
    family_name: 'User'
  });
});

// JWKS endpoint (simplified)
app.get('/jwks', (req, res) => {
  res.json({
    keys: [
      {
        kty: 'oct',
        use: 'sig',
        kid: 'demo-key-1',
        alg: 'HS256'
      }
    ]
  });
});

app.listen(PORT, () => {
  console.log(`🔐 OAuth2/OIDC Server running on port ${PORT}`);
  console.log(`🌐 Issuer URL: ${ISSUER}`);
  console.log(`📚 PKCE Demo: http://localhost:${PORT}/demo/pkce`);
  console.log(`🔍 Well-known config: ${ISSUER}/.well-known/openid_configuration`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
});
