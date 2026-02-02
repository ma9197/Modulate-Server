import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import reports from './routes/reports';

const app = new Hono<{ Bindings: Env }>();

// Enable CORS for local development and production
app.use('/*', cors({
  origin: '*', // In production, you might want to restrict this
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  maxAge: 86400,
}));

// Health check endpoint
app.get('/health', (c) => {
  return c.json({ ok: true });
});

// Mount reports routes
app.route('/reports', reports);

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not found' }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error('Server error:', err);
  return c.json({ 
    error: 'Internal server error',
    message: err.message 
  }, 500);
});

export default app;

