const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_DIR = process.env.DATA_DIR || '/app/data';

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', service: 'payment-service' });
});

// Ensure data directory exists
fs.ensureDirSync(DATA_DIR);

// In-memory store for this demo (in production, use Redis or database)
const payments = new Map();
const idempotencyStore = new Map();

// Payment endpoint with idempotency key support
app.post('/payments', async (req, res) => {
  try {
    const idempotencyKey = req.headers['idempotency-key'];
    
    if (!idempotencyKey) {
      return res.status(400).json({ 
        error: 'Missing Idempotency-Key header' 
      });
    }

    // Check if we've seen this idempotency key before
    if (idempotencyStore.has(idempotencyKey)) {
      const existingResponse = idempotencyStore.get(idempotencyKey);
      console.log(`Returning cached response for idempotency key: ${idempotencyKey}`);
      return res.status(existingResponse.status).json(existingResponse.data);
    }

    const { amount, currency, description } = req.body;

    // Validate required fields
    if (!amount || !currency) {
      const errorResponse = {
        status: 400,
        data: { error: 'Missing required fields: amount, currency' }
      };
      idempotencyStore.set(idempotencyKey, errorResponse);
      return res.status(400).json(errorResponse.data);
    }

    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Create payment
    const paymentId = uuidv4();
    const payment = {
      id: paymentId,
      amount,
      currency,
      description,
      status: 'completed',
      created_at: new Date().toISOString(),
      idempotency_key: idempotencyKey
    };

    payments.set(paymentId, payment);

    // Store the response for idempotency
    const successResponse = {
      status: 201,
      data: payment
    };
    idempotencyStore.set(idempotencyKey, successResponse);

    // Persist to file for demo purposes
    const filePath = path.join(DATA_DIR, `payment_${paymentId}.json`);
    await fs.writeJSON(filePath, payment, { spaces: 2 });

    console.log(`Payment created: ${paymentId} with idempotency key: ${idempotencyKey}`);
    res.status(201).json(payment);

  } catch (error) {
    console.error('Payment processing error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get payment by ID
app.get('/payments/:id', (req, res) => {
  const { id } = req.params;
  const payment = payments.get(id);
  
  if (!payment) {
    return res.status(404).json({ error: 'Payment not found' });
  }
  
  res.json(payment);
});

// List all payments
app.get('/payments', (req, res) => {
  const allPayments = Array.from(payments.values());
  res.json({
    payments: allPayments,
    count: allPayments.length
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`💳 Payment Service running on port ${PORT}`);
  console.log(`📁 Data directory: ${DATA_DIR}`);
  console.log(`🔑 Idempotency-Key header required for POST /payments`);
});