import crypto from 'node:crypto';
import { Request, Response, NextFunction } from 'express';
import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };
import { store } from './store.ts';
import { UserRole } from '../src/shared/types.ts';

const OWNER_ADMIN_EMAIL = 'outstandiiing@gmail.com';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

const firebaseApp = getApps().length
  ? getApp()
  : initializeApp({ projectId: firebaseConfig.projectId });
const adminAuth = getAuth(firebaseApp);

export interface SessionPayload {
  userId: string;
  username: string;
  role: UserRole;
  iat: number;
  exp: number;
}

export interface AuthenticatedRequest extends Request {
  auth?: SessionPayload;
}

export function hashSecret(secret: string, saltHex?: string): { hash: string; salt: string } {
  const salt = saltHex || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(secret, salt, 64).toString('hex');
  return { hash, salt };
}

export function verifySecret(secret: string, expectedHash: string, salt: string): boolean {
  const actual = crypto.scryptSync(secret, salt, 64);
  const expected = Buffer.from(expectedHash, 'hex');
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

export function verifyEnvPasscode(candidate: string, envPasscode: string): boolean {
  const a = crypto.createHash('sha256').update(candidate).digest();
  const b = crypto.createHash('sha256').update(envPasscode).digest();
  return crypto.timingSafeEqual(a, b);
}

export function signSessionToken(payload: Omit<SessionPayload, 'iat' | 'exp'>): string {
  const now = Date.now();
  const full: SessionPayload = {
    ...payload,
    iat: now,
    exp: now + TOKEN_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(full)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
    if (!parsed.userId || !parsed.exp || parsed.exp < Date.now()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function verifyFirebaseUser(idToken: string) {
  const decoded = await adminAuth.verifyIdToken(idToken);
  const isOwnerAdmin =
    typeof decoded.email === 'string' &&
    decoded.email.toLowerCase() === OWNER_ADMIN_EMAIL &&
    decoded.email_verified === true;
  return {
    uid: decoded.uid,
    email: decoded.email || '',
    emailVerified: Boolean(decoded.email_verified),
    isOwnerAdmin,
  };
}

export function optionalAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    const token = header.slice('Bearer '.length).trim();
    const verified = verifySessionToken(token);
    if (verified) {
      req.auth = verified;
    }
  }
  next();
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }
  const token = header.slice('Bearer '.length).trim();
  const verified = verifySessionToken(token);
  if (!verified) {
    return res.status(401).json({ error: 'Session expired or invalid. Please log in again.' });
  }
  if (verified.role === 'player') {
    const user = store.state.users[verified.userId];
    if (!user) {
      return res.status(401).json({ error: 'Player account not found.' });
    }
  }
  req.auth = verified;
  next();
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (!req.auth || req.auth.role !== 'admin') {
      return res.status(403).json({ error: 'Administrator privileges required.' });
    }
    next();
  });
}

export function isAdminSetupRequired(): { requiresSetup: boolean; envConfigured: boolean } {
  const envPass = (process.env.ADMIN_PASSCODE || '').trim();
  if (envPass.length > 0) {
    return { requiresSetup: false, envConfigured: true };
  }
  return {
    requiresSetup: !store.state.adminCredential,
    envConfigured: false,
  };
}
