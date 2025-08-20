const express = require('express');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3002;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'your-webhook-secret-key-here';

// Middleware to capture raw body for signature verification
const rawBodyMiddleware = (req, res, next) => {
  let data = '';
  req.setEncoding('utf8');
  req.on('data', chunk => data += chunk);
  req.on('end', () => {
    req.rawBody = data;
    try {
      req.body = JSON.parse(data);
    } catch (error) {
      req.body = {};
    }
    next();
  });
};

app.use(rawBodyMiddleware);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'webhook-service',
    timestamp: new Date().toISOString()
  });
});

// HMAC signature verification middleware
const verifySignature = (req, res, next) => {
  const signature = req.headers['x-signature-256'] || req.headers['x-hub-signature-256'];
  
  if (!signature) {
    return res.status(400).json({
      error: 'missing_signature',
      message: 'X-Signature-256 header is required'
    });
  }

  // Generate expected signature
  const expectedSignature = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(req.rawBody, 'utf8')
    .digest('hex');

  // GitHub style signature format: sha256=<hash>
  const expectedWithPrefix = `sha256=${expectedSignature}`;
  
  // Compare signatures using crypto.timingSafeEqual to prevent timing attacks
  const providedSignature = signature.replace('sha256=', '');
  
  if (!crypto.timingSafeEqual(
    Buffer.from(expectedSignature, 'hex'),
    Buffer.from(providedSignature, 'hex')
  )) {
    console.log(`🚨 Invalid signature: ${signature}`);
    console.log(`🔐 Expected: ${expectedWithPrefix}`);
    return res.status(401).json({
      error: 'invalid_signature',
      message: 'Webhook signature verification failed'
    });
  }

  console.log(`✅ Signature verified for webhook`);
  next();
};

// Webhook endpoint with signature verification
app.post('/webhook', verifySignature, (req, res) => {
  const event = req.body;
  const eventType = req.headers['x-event-type'] || 'unknown';
  
  console.log(`📨 Webhook received: ${eventType}`);
  console.log(`📄 Payload:`, JSON.stringify(event, null, 2));

  // Process different event types
  switch (eventType) {
    case 'payment.succeeded':
      handlePaymentSucceeded(event);
      break;
    case 'payment.failed':
      handlePaymentFailed(event);
      break;
    case 'user.created':
      handleUserCreated(event);
      break;
    default:
      console.log(`❓ Unhandled event type: ${eventType}`);
  }

  // Always respond with 200 to acknowledge receipt
  res.status(200).json({
    message: 'Webhook processed successfully',
    event_type: eventType,
    timestamp: new Date().toISOString()
  });
});

// Event handlers
function handlePaymentSucceeded(event) {
  console.log(`💰 Payment succeeded: ${event.payment?.id} - $${event.payment?.amount}`);
  // In a real application, you might:
  // - Update database records
  // - Send confirmation emails
  // - Update inventory
  // - Trigger fulfillment processes
}

function handlePaymentFailed(event) {
  console.log(`❌ Payment failed: ${event.payment?.id} - Reason: ${event.payment?.failure_reason}`);
  // In a real application, you might:
  // - Notify customer of failure
  // - Log for analytics
  // - Trigger retry logic
  // - Update payment status
}

function handleUserCreated(event) {
  console.log(`👤 New user created: ${event.user?.id} (${event.user?.email})`);
  // In a real application, you might:
  // - Send welcome emails
  // - Create user profiles in other systems
  // - Trigger onboarding workflows
  // - Update analytics
}

// Demo endpoint that shows how to generate correct signatures
app.get('/demo/signature', (req, res) => {
  const samplePayload = {
    event_type: 'payment.succeeded',
    payment: {
      id: 'pay_demo123',
      amount: 1000,
      currency: 'usd',
      status: 'succeeded'
    },
    timestamp: new Date().toISOString()
  };

  const payload = JSON.stringify(samplePayload);
  const signature = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(payload, 'utf8')
    .digest('hex');

  res.json({
    message: 'Webhook Signature Demo',
    instructions: [
      'Use the payload and signature below to test webhook endpoint',
      'Include X-Signature-256 header with the provided signature',
      'Include X-Event-Type header to specify event type'
    ],
    webhook_url: `http://localhost:${PORT}/webhook`,
    secret_used: WEBHOOK_SECRET,
    sample_payload: samplePayload,
    required_headers: {
      'Content-Type': 'application/json',
      'X-Signature-256': `sha256=${signature}`,
      'X-Event-Type': 'payment.succeeded'
    },
    curl_example: [
      `curl -X POST http://localhost:${PORT}/webhook \\`,
      `  -H "Content-Type: application/json" \\`,
      `  -H "X-Signature-256: sha256=${signature}" \\`,
      `  -H "X-Event-Type: payment.succeeded" \\`,
      `  -d '${payload}'`
    ].join('\n')
  });
});

// Test endpoint without signature verification (for comparison)
app.post('/webhook-insecure', (req, res) => {
  console.log('🚨 INSECURE webhook received (no signature verification)');
  console.log('📄 Payload:', JSON.stringify(req.body, null, 2));
  
  res.json({
    message: 'Insecure webhook processed (this is dangerous in production!)',
    timestamp: new Date().toISOString()
  });
});

// Endpoint to test signature generation client-side
app.post('/verify-signature', (req, res) => {
  const { payload, signature } = req.body;
  
  if (!payload || !signature) {
    return res.status(400).json({
      error: 'missing_fields',
      message: 'Both payload and signature are required'
    });
  }

  const expectedSignature = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(JSON.stringify(payload), 'utf8')
    .digest('hex');

  const isValid = crypto.timingSafeEqual(
    Buffer.from(expectedSignature, 'hex'),
    Buffer.from(signature.replace('sha256=', ''), 'hex')
  );

  res.json({
    is_valid: isValid,
    provided_signature: signature,
    expected_signature: `sha256=${expectedSignature}`,
    payload_hash: crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')
  });
});

// Error handling
app.use((error, req, res, next) => {
  console.error('Webhook service error:', error);
  res.status(500).json({
    error: 'internal_error',
    message: 'Webhook processing failed'
  });
});

app.listen(PORT, () => {
  console.log(`🎣 Webhook Service running on port ${PORT}`);
  console.log(`🔐 Using webhook secret: ${WEBHOOK_SECRET}`);
  console.log(`📚 Demo endpoint: http://localhost:${PORT}/demo/signature`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
});
