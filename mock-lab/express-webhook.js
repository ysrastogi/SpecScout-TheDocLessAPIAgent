const express = require('express');
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3004;
const DATA_DIR = path.join(__dirname, 'data');

// Middleware
app.use(express.json());
app.use(express.raw({ type: 'application/json' })); // For signature verification

// In-memory storage for demo (in production, use a database)
let payments = new Map();
let idempotencyKeys = new Map();

// Ensure data directory exists
const initStorage = async () => {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    console.log('📁 Storage directory initialized');
  } catch (error) {
    console.error('Failed to create storage directory:', error);
  }
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'payment-service',
    timestamp: new Date().toISOString(),
    payments_count: payments.size,
    idempotency_keys_tracked: idempotencyKeys.size
  });
});

// Middleware to handle idempotency
const handleIdempotency = async (req, res, next) => {
  const idempotencyKey = req.headers['idempotency-key'];
  
  if (!idempotencyKey) {
    return res.status(400).json({
      error: 'missing_idempotency_key',
      message: 'Idempotency-Key header is required for payment operations'
    });
  }

  // Check if we've seen this key before
  if (idempotencyKeys.has(idempotencyKey)) {
    const existingResponse = idempotencyKeys.get(idempotencyKey);
    console.log(`🔄 Returning cached response for idempotency key: ${idempotencyKey}`);
    return res.status(existingResponse.status).json(existingResponse.data);
  }

  // Store the key for this request
  req.idempotencyKey = idempotencyKey;
  next();
};

// Create payment endpoint
app.post('/payments', handleIdempotency, async (req, res) => {
  try {
    const { amount, currency, payment_method, description, metadata } = req.body;

    // Validate required fields
    if (!amount || !currency || !payment_method) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'Missing required fields: amount, currency, payment_method'
      });
    }

    // Generate payment ID
    const paymentId = `pay_${crypto.randomBytes(16).toString('hex')}`;
    
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));
    
    // Simulate occasional failures for testing
    const shouldFail = Math.random() < 0.1; // 10% failure rate
    
    let payment, statusCode;
    
    if (shouldFail) {
      payment = {
        id: paymentId,
        status: 'failed',
        amount,
        currency,
        payment_method,
        description,
        metadata: metadata || {},
        error: {
          code: 'payment_failed',
          message: 'Payment processing failed - simulated error'
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      statusCode = 400;
    } else {
      payment = {
        id: paymentId,
        status: 'succeeded',
        amount,
        currency,
        payment_method,
        description,
        metadata: metadata || {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      statusCode = 201;
    }

    // Store the payment
    payments.set(paymentId, payment);
    
    // Store the idempotent response
    const response = { status: statusCode, data: payment };
    idempotencyKeys.set(req.idempotencyKey, response);

    // Persist to disk for demo purposes
    await fs.writeFile(
      path.join(DATA_DIR, `${paymentId}.json`),
      JSON.stringify(payment, null, 2)
    );

    console.log(`💳 Payment ${payment.status}: ${paymentId} (${currency}${amount})`);
    res.status(statusCode).json(payment);

  } catch (error) {
    console.error('Payment creation error:', error);
    res.status(500).json({
      error: 'internal_error',
      message: 'Internal server error'
    });
  }
});

// Get payment endpoint
app.get('/payments/:id', (req, res) => {
  const { id } = req.params;
  
  if (!payments.has(id)) {
    return res.status(404).json({
      error: 'payment_not_found',
      message: `Payment with id ${id} not found`
    });
  }

  const payment = payments.get(id);
  res.json(payment);
});

// List payments endpoint
app.get('/payments', (req, res) => {
  const { limit = 10, starting_after, ending_before, status } = req.query;
  
  let paymentList = Array.from(payments.values());
  
  // Filter by status if provided
  if (status) {
    paymentList = paymentList.filter(p => p.status === status);
  }
  
  // Sort by creation date (newest first)
  paymentList.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  
  // Simple pagination (in production, use proper cursor-based pagination)
  const startIndex = starting_after ? 
    paymentList.findIndex(p => p.id === starting_after) + 1 : 0;
  const endIndex = ending_before ?
    paymentList.findIndex(p => p.id === ending_before) : undefined;
    
  const paginatedList = paymentList.slice(startIndex, endIndex).slice(0, parseInt(limit));
  
  res.json({
    data: paginatedList,
    has_more: paginatedList.length === parseInt(limit),
    pagination: {
      starting_after,
      ending_before,
      limit: parseInt(limit)
    }
  });
});

// Refund payment endpoint (also idempotent)
app.post('/payments/:id/refund', handleIdempotency, async (req, res) => {
  const { id } = req.params;
  const { amount, reason } = req.body;
  
  if (!payments.has(id)) {
    return res.status(404).json({
      error: 'payment_not_found',
      message: `Payment with id ${id} not found`
    });
  }

  const payment = payments.get(id);
  
  if (payment.status !== 'succeeded') {
    return res.status(400).json({
      error: 'invalid_payment_status',
      message: 'Can only refund succeeded payments'
    });
  }

  const refundId = `re_${crypto.randomBytes(16).toString('hex')}`;
  const refund = {
    id: refundId,
    payment_id: id,
    amount: amount || payment.amount,
    reason: reason || 'requested_by_customer',
    status: 'succeeded',
    created_at: new Date().toISOString()
  };

  // Store idempotent response
  const response = { status: 200, data: refund };
  idempotencyKeys.set(req.idempotencyKey, response);

  console.log(`💸 Refund created: ${refundId} for payment ${id}`);
  res.json(refund);
});

// Demo endpoint to show idempotency key usage
app.get('/demo/idempotency', (req, res) => {
  res.json({
    message: 'Idempotency Key Demo',
    instructions: [
      'Make a POST request to /payments with an Idempotency-Key header',
      'Repeat the same request with the same key - you\'ll get the same response',
      'Change the key and make the request again - you\'ll get a new payment'
    ],
    example_headers: {
      'Idempotency-Key': 'unique-key-12345',
      'Content-Type': 'application/json'
    },
    example_body: {
      amount: 1000,
      currency: 'usd',
      payment_method: 'card',
      description: 'Test payment'
    },
    tracked_keys: Array.from(idempotencyKeys.keys())
  });
});

// Clear demo data endpoint
app.delete('/demo/clear', async (req, res) => {
  payments.clear();
  idempotencyKeys.clear();
  
  try {
    // Clear persisted files
    const files = await fs.readdir(DATA_DIR);
    for (const file of files) {
      if (file.endsWith('.json')) {
        await fs.unlink(path.join(DATA_DIR, file));
      }
    }
  } catch (error) {
    console.warn('Error cleaning up files:', error);
  }
  
  console.log('🧹 Demo data cleared');
  res.json({ message: 'Demo data cleared successfully' });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    error: 'internal_error',
    message: 'An unexpected error occurred'
  });
});

// Start server
const startServer = async () => {
  await initStorage();
  
  app.listen(PORT, () => {
    console.log(`💳 Payment Service running on port ${PORT}`);
    console.log(`📚 Demo endpoint: http://localhost:${PORT}/demo/idempotency`);
    console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  });
};

startServer().catch(console.error);

// Webhook service (separate from payment service)
const webhookApp = express();
const WEBHOOK_PORT = process.env.WEBHOOK_PORT || 3002;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'your-webhook-secret-key-here';

// Health check endpoint
webhookApp.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', service: 'webhook-service' });
});

// Middleware to capture raw body
webhookApp.use('/webhook', express.raw({ type: 'application/json' }));
webhookApp.use(express.json());

// HMAC signature verification middleware
function verifySignature(req, res, next) {
  const signature = req.headers['x-hub-signature-256'];
  
  if (!signature) {
    return res.status(401).json({ error: 'Missing X-Hub-Signature-256 header' });
  }

  const rawBody = req.body;
  const expectedSignature = 'sha256=' + crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    console.log('Signature verification failed');
    console.log('Expected:', expectedSignature);
    console.log('Received:', signature);
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Parse the JSON body after verification
  try {
    req.body = JSON.parse(rawBody);
    next();
  } catch (error) {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }
}

// Webhook endpoint with HMAC verification
webhookApp.post('/webhook', verifySignature, (req, res) => {
  const { event, data } = req.body;
  
  console.log(`📨 Webhook received - Event: ${event}`);
  console.log('📄 Payload:', JSON.stringify(data, null, 2));
  
  // Process different event types
  switch (event) {
    case 'payment.created':
      console.log('💳 Payment created webhook processed');
      break;
    case 'payment.completed':
      console.log('✅ Payment completed webhook processed');
      break;
    case 'payment.failed':
      console.log('❌ Payment failed webhook processed');
      break;
    default:
      console.log(`🤷 Unknown event type: ${event}`);
  }

  // Respond with 200 to acknowledge receipt
  res.status(200).json({ 
    message: 'Webhook processed successfully',
    event,
    timestamp: new Date().toISOString()
  });
});

// Utility endpoint to generate HMAC signature for testing
webhookApp.post('/generate-signature', express.json(), (req, res) => {
  const payload = JSON.stringify(req.body);
  const signature = 'sha256=' + crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');
  
  res.json({
    payload,
    signature,
    secret_hint: WEBHOOK_SECRET.substring(0, 4) + '***'
  });
});

// Test endpoint
webhookApp.get('/test', (req, res) => {
  res.json({ 
    message: 'Webhook service is running',
    secret_configured: !!WEBHOOK_SECRET,
    timestamp: new Date().toISOString()
  });
});

webhookApp.listen(WEBHOOK_PORT, '0.0.0.0', () => {
  console.log(`🪝 Webhook Service running on port ${WEBHOOK_PORT}`);
  console.log(`🔐 Webhook secret: ${WEBHOOK_SECRET.substring(0, 4)}***`);
  console.log(`📝 POST /webhook - expects X-Hub-Signature-256 header`);
  console.log(`🧪 POST /generate-signature - utility for testing`);
});
