# ZonForge SaaS Backend Setup Guide

## Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

### Required Variables

- **DATABASE_URL** - PostgreSQL connection string
  - Format: `postgresql://user:password@host:5432/database`
  - Example: `postgresql://USER:PASSWORD@localhost:5432/zonforge_saas`

- **JWT_SECRET** - Random secret for signing JWT tokens
  - Example: `your-super-secret-jwt-key-min-32-chars-long`
  - Generate with: `openssl rand -base64 32`

- **STRIPE_SECRET_KEY** - Stripe API secret key
  - Get from: https://dashboard.stripe.com/apikeys
  - Starts with: `sk_test_` or `sk_live_`

- **STRIPE_WEBHOOK_SECRET** - Webhook signing secret
  - Get from: https://dashboard.stripe.com/webhooks
  - Starts with: `whsec_`

- **PORT** - Server port (default: 3000)

- **NODE_ENV** - Environment (development, production)

## Database Setup

### PostgreSQL Installation

**macOS (homebrew):**
```bash
brew install postgresql
brew services start postgresql
createdb zonforge_saas
```

**Windows (using Docker):**
```bash
docker run -d \
  --name zonforge-postgres \
  -e POSTGRES_PASSWORD=your_password \
  -e POSTGRES_DB=zonforge_saas \
  -p 5432:5432 \
  postgres:15
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo -u postgres createdb zonforge_saas
```

### Connection String

Update `.env` with your PostgreSQL connection:
```
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/zonforge_saas
```

## Running the Backend

### Development

```bash
npm run dev
```

Server starts on `http://localhost:3000`

### Production Build

```bash
npm run build
npm start
```

## API Endpoints

### Authentication

**Register User:**
```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"securepass123"}'
```

Response:
```json
{
  "success": true,
  "userId": 1,
  "token": "eyJhbGc...",
  "redirectUrl": "/success"
}
```

**Login User:**
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"securepass123"}'
```

### Protected Endpoint

```bash
curl http://localhost:3000/api/user \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Stripe Webhook

The webhook endpoint listens at:
```
POST /webhook/stripe
```

Configure in Stripe Dashboard:
1. Go to https://dashboard.stripe.com/webhooks
2. Add endpoint: `https://your-api.com/webhook/stripe`
3. Select events: `checkout.session.completed`
4. Copy signing secret to `STRIPE_WEBHOOK_SECRET`

## Full Payment Flow

### 1. User clicks payment link on landing page
```
https://buy.stripe.com/3cIeVe1BL1GWbKk37H2cg00
```

### 2. Stripe checkout completes
- Stripe sends `checkout.session.completed` webhook
- Backend receives webhook at POST `/webhook/stripe`

### 3. Backend creates user and subscription
- Checks if user exists by email
- If not, creates user with temporary password
- Creates tenant workspace
- Creates subscription record

### 4. User redirected to success page
```
https://zonforge.com/success?email=user@example.com
```

### 5. User receives confirmation email
- Contains confirmation link
- Contains temporary password reset option

## Stripe Configuration

### Test Mode Setup

1. Go to https://dashboard.stripe.com/test/apikeys
2. Copy **Secret key** (starts with `sk_test_`) → `STRIPE_SECRET_KEY`
3. Go to https://dashboard.stripe.com/test/webhooks
4. Create webhook for `checkout.session.completed`
5. Copy **Signing secret** → `STRIPE_WEBHOOK_SECRET`

### Test Payment Link

Use the existing link:
```
https://buy.stripe.com/3cIeVe1BL1GWbKk37H2cg00
```

Test with Stripe test card:
- Card: `4242 4242 4242 4242`
- Expiry: `12/25`
- CVC: `123`

## Deployment to Railway

### 1. Create Railway Project
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Create project
railway init
```

### 2. Add PostgreSQL
```bash
railway add --name postgres
```

### 3. Set Environment Variables
```bash
railway variables set JWT_SECRET=your_jwt_secret
railway variables set STRIPE_SECRET_KEY=sk_test_xxx
railway variables set STRIPE_WEBHOOK_SECRET=whsec_xxx
```

### 4. Deploy
```bash
railway up
```

### 5. Get Production URL
```bash
railway status
# Copy the deployment URL
```

### 6. Update Stripe Webhook
- Stripe Dashboard → Webhooks
- Add endpoint: `https://your-railway-url.com/webhook/stripe`
- Update webhook secret in Railway variables

## Database Migrations

The app automatically creates tables on startup:
- `users` - User accounts
- `tenants` - Workspace organizations  
- `subscriptions` - Subscription records

To reset database:
```bash
dropdb zonforge_saas
createdb zonforge_saas
npm run dev
```

## Monitoring

### Check logs
```bash
# Development
npm run dev

# Production (Railway)
railway logs
```

### Database queries
```bash
# Connect to database
psql postgresql://user:password@localhost:5432/zonforge_saas

# List tables
\dt

# Check users
SELECT * FROM users;

# Check subscriptions  
SELECT * FROM subscriptions;
```

## Security Checklist

- [ ] Use strong JWT_SECRET (min 32 characters)
- [ ] Use PostgreSQL with strong password
- [ ] Enable HTTPS in production
- [ ] Verify Stripe webhook signatures
- [ ] Hash passwords with bcryptjs
- [ ] Use environment variables for secrets
- [ ] Rotate Stripe webhook secrets regularly
- [ ] Monitor failed login attempts
- [ ] Set up database backups
- [ ] Enable CORS only for trusted domains

## Troubleshooting

**"Cannot find module 'pg'"**
```bash
npm install pg @types/pg
```

**JWT verification failing**
- Check JWT_SECRET matches between encode/decode
- Verify token hasn't expired
- Check Authorization header format: `Bearer <token>`

**Webhook not receiving**
- Verify `STRIPE_WEBHOOK_SECRET` matches Stripe Dashboard
- Check endpoint URL is publicly accessible
- Review webhook logs in Stripe Dashboard

**Database connection error**
- Verify PostgreSQL is running
- Check DATABASE_URL format and credentials
- Ensure database exists: `createdb zonforge_saas`

## Next Steps

1. Deploy backend to Railway
2. Update Stripe webhook endpoint to production URL
3. Update frontend success page redirect
4. Test full payment flow end-to-end
5. Set up email confirmations (SendGrid/AWS SES)
6. Add user dashboard
7. Implement admin analytics
