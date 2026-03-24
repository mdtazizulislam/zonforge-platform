import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { getPool, getTenantByUserId } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_here';

export interface JWTPayload {
  userId: number;
  email: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export function createJWT(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyJWT(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch (error) {
    return null;
  }
}

export async function registerUser(email: string, password: string): Promise<{ userId: number; token: string }> {
  const pool = getPool();
  const passwordHash = await hashPassword(password);

  try {
    const result = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      [email, passwordHash]
    );

    const user = result.rows[0];
    const token = createJWT({ userId: user.id, email: user.email });

    return { userId: user.id, token };
  } catch (error) {
    throw new Error('User registration failed');
  }
}

export async function loginUser(email: string, password: string): Promise<{ userId: number; token: string }> {
  const pool = getPool();

  try {
    const result = await pool.query('SELECT id, email, password_hash FROM users WHERE email = $1', [email]);

    if (result.rows.length === 0) {
      throw new Error('User not found');
    }

    const user = result.rows[0];
    const isValid = await verifyPassword(password, user.password_hash);

    if (!isValid) {
      throw new Error('Invalid password');
    }

    const token = createJWT({ userId: user.id, email: user.email });
    return { userId: user.id, token };
  } catch (error) {
    throw new Error('Login failed');
  }
}

export async function getUserById(userId: number) {
  const pool = getPool();

  try {
    const result = await pool.query('SELECT id, email FROM users WHERE id = $1', [userId]);
    return result.rows[0] || null;
  } catch (error) {
    return null;
  }
}

export async function getUserByEmail(email: string) {
  const pool = getPool();

  try {
    const result = await pool.query('SELECT id, email FROM users WHERE email = $1', [email]);
    return result.rows[0] || null;
  } catch (error) {
    return null;
  }
}

export async function getTenantIdForUser(userId: number): Promise<number | null> {
  const tenant = await getTenantByUserId(userId);
  return tenant?.id || null;
}
