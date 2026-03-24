import Stripe from 'stripe';
import { getPool } from './db.js';
import { hashPassword, getUserByEmail } from './auth.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16',
});

export async function handleCheckoutSessionCompleted(sessionId: string) {
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (!session.customer_email) {
      throw new Error('No customer email in session');
    }

    const pool = getPool();
    const email = session.customer_email;
    let user = await getUserByEmail(email);

    // Create user if doesn't exist
    if (!user) {
      const tempPassword = Math.random().toString(36).slice(-12);
      const passwordHash = await hashPassword(tempPassword);

      const result = await pool.query(
        'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
        [email, passwordHash]
      );

      user = result.rows[0];
      console.log(`✓ Created user ${email}`);
    }

    // Create tenant
    await pool.query(
      'INSERT INTO tenants (name, plan, user_id) VALUES ($1, $2, $3)',
      [`${email}'s workspace`, 'starter', user.id]
    );

    // Create subscription
    await pool.query(
      'INSERT INTO subscriptions (stripe_customer_id, stripe_subscription_id, plan, status, user_id) VALUES ($1, $2, $3, $4, $5)',
      [session.customer as string, session.subscription || 'pending', 'starter', 'active', user.id]
    );

    console.log(`✓ Subscription created for ${email}`);
    return user;
  } catch (error) {
    console.error('✗ Stripe webhook error:', error);
    throw error;
  }
}

export function verifyWebhookSignature(body: string, signature: string): any {
  try {
    return stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET || ''
    );
  } catch (error) {
    throw new Error('Invalid webhook signature');
  }
}
