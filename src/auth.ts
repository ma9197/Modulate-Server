import { createRemoteJWKSet, jwtVerify } from 'jose';
import { Context } from 'hono';
import type { Env, SupabaseJWTPayload } from './types';

// In-memory cache for JWKS with TTL
interface JWKSCache {
  jwks: ReturnType<typeof createRemoteJWKSet> | null;
  timestamp: number;
}

const jwksCache: JWKSCache = {
  jwks: null,
  timestamp: 0
};

const JWKS_CACHE_TTL = 3600000; // 1 hour in milliseconds

/**
 * Get or create cached JWKS
 */
function getJWKS(supabaseUrl: string): ReturnType<typeof createRemoteJWKSet> {
  const now = Date.now();
  
  if (!jwksCache.jwks || (now - jwksCache.timestamp) > JWKS_CACHE_TTL) {
    const jwksUrl = new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`);
    jwksCache.jwks = createRemoteJWKSet(jwksUrl);
    jwksCache.timestamp = now;
  }
  
  return jwksCache.jwks;
}

/**
 * Verify JWT token from Authorization header
 * Extracts user_id from sub claim
 */
export async function verifyToken(
  authHeader: string | undefined,
  supabaseUrl: string
): Promise<{ userId: string; payload: SupabaseJWTPayload }> {
  if (!authHeader) {
    throw new Error('Missing Authorization header');
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    throw new Error('Invalid Authorization header format. Expected: Bearer <token>');
  }

  const token = parts[1];
  
  try {
    const jwks = getJWKS(supabaseUrl);
    
    const { payload } = await jwtVerify(token, jwks, {
      issuer: `${supabaseUrl}/auth/v1`,
      audience: 'authenticated'
    });

    if (!payload.sub) {
      throw new Error('Token missing sub claim');
    }

    return {
      userId: payload.sub,
      payload: payload as SupabaseJWTPayload
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`JWT verification failed: ${error.message}`);
    }
    throw new Error('JWT verification failed');
  }
}

/**
 * Hono middleware to protect routes with JWT authentication
 */
export async function authMiddleware(c: Context<{ Bindings: Env }>, next: () => Promise<void>) {
  const authHeader = c.req.header('Authorization');
  const supabaseUrl = c.env.SUPABASE_URL;

  if (!supabaseUrl) {
    return c.json({ error: 'Server configuration error: Missing SUPABASE_URL' }, 500);
  }

  try {
    const { userId, payload } = await verifyToken(authHeader, supabaseUrl);
    
    // Store user info in context for use in route handlers
    c.set('userId', userId);
    c.set('userPayload', payload);
    
    await next();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Authentication failed';
    return c.json({ error: message }, 401);
  }
}

