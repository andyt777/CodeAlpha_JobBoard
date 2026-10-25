import crypto from 'node:crypto';
import { HttpError } from './errors.js';

const SESSION_DAYS = 7;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const expected = Buffer.from(hash, 'hex');
  const actual = crypto.scryptSync(password, salt, 64);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

// Only a SHA-256 of each token is stored, so a leaked database can't be used to log in.
const digest = (token) => crypto.createHash('sha256').update(token).digest('hex');

export function createAuth(db) {
  const q = {
    insert: db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)'),
    find: db.prepare(`
      SELECT u.id, u.name, u.email, u.role
      FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ? AND u.is_active = 1`),
    remove: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    purge: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
  };

  function issueToken(userId) {
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
    q.purge.run(new Date().toISOString());
    q.insert.run(digest(token), userId, expires);
    return token;
  }

  const tokenFrom = (req) => req.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];

  // Sets req.user when a valid token is present; never rejects the request.
  function authenticate(req, res, next) {
    const token = tokenFrom(req);
    req.user = token ? q.find.get(digest(token), new Date().toISOString()) ?? null : null;
    next();
  }

  function requireAuth(req, res, next) {
    if (!req.user) throw new HttpError(401, 'Authentication required');
    next();
  }

  const requireRole = (...roles) => (req, res, next) => {
    if (!req.user) throw new HttpError(401, 'Authentication required');
    if (!roles.includes(req.user.role)) throw new HttpError(403, 'You do not have permission to do this');
    next();
  };

  function revoke(req) {
    const token = tokenFrom(req);
    if (token) q.remove.run(digest(token));
  }

  return { issueToken, authenticate, requireAuth, requireRole, revoke };
}
