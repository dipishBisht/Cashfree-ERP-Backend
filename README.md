# Cashfree Payment Module (UMS/ERP)

NestJS + MongoDB backend module that handles the full payment lifecycle with Cashfree PG (sandbox): create order, track status, receive webhooks, verify and store the final status.

## Setup

```bash
npm install
cp .env.example .env     # fill in sandbox credentials
npm run start:dev
```

`.env`:

```
PORT=3000
MONGODB_URI=mongodb://localhost:27017/trainx_payments
CASHFREE_CLIENT_ID=your_sandbox_client_id
CASHFREE_CLIENT_SECRET=your_sandbox_client_secret
CASHFREE_API_VERSION=2025-01-01
CASHFREE_BASE_URL=https://sandbox.cashfree.com/pg
CASHFREE_RETURN_URL=https://example.com/payment/return
CASHFREE_NOTIFY_URL=https://<public-url>/api/v1/payments/webhook/cashfree
```

- Swagger docs: `http://localhost:3000/docs`
- Base path: `/api/v1`
- For local webhook testing, expose the port with ngrok/cloudflared and put that URL in `CASHFREE_NOTIFY_URL` and in the Cashfree dashboard webhook settings.

## API

| Method | Endpoint | Description |
|---|---|---|
| POST | `/payments/orders` | Create a payment. Header `Idempotency-Key` is required. |
| GET | `/payments/:orderId` | Get the stored payment status. |
| POST | `/payments/:orderId/sync` | Re-verify status with Cashfree and update the record. |
| GET | `/payments/student/:studentId` | List a student's payments (newest first). |
| POST | `/payments/webhook/cashfree` | Cashfree webhook (signature verified). |

### Create payment

```http
POST /api/v1/payments/orders
Idempotency-Key: 7c1f...unique
Content-Type: application/json

{
  "studentId": "STU1001",
  "amount": 1500,
  "currency": "INR",
  "customer": { "name": "Asha Verma", "email": "asha@example.com", "phone": "9876543210" }
}
```

Response:

```json
{
  "paymentId": "...",
  "orderId": "TXN_ab12...",
  "cfOrderId": "...",
  "paymentSessionId": "session_...",
  "amount": 1500,
  "currency": "INR",
  "status": "PENDING"
}
```

The frontend uses `paymentSessionId` with the Cashfree JS SDK checkout.

## Payment workflow

1. The client calls `POST /payments/orders` with an `Idempotency-Key`.
2. A `Payment` record is saved as `INITIATING`, then the Cashfree order is created.
3. On success it becomes `PENDING` and `paymentSessionId` is returned. On Cashfree failure it becomes `FAILED`.
4. The user pays on the Cashfree checkout and is redirected to `CASHFREE_RETURN_URL`.
5. Cashfree calls the webhook. The signature (HMAC-SHA256 of `timestamp + rawBody`) is verified, the event is stored, and the status is re-verified using the Cashfree Orders/Payments API.
6. The frontend can call `GET /payments/:orderId` or `POST /payments/:orderId/sync` at any time (for example, after the return redirect).

Statuses: `INITIATING`, `PENDING`, `SUCCESS`, `FAILED`, `CANCELLED`, `EXPIRED`.

## Database schema (MongoDB / Mongoose)

**payments**: `orderId` (unique), `cfOrderId`, `studentId`, `amount`, `currency`, `status`, `paymentSessionId`, `cfPaymentId`, `paymentMethod`, `failureReason`, `idempotencyKey` (unique), `customer {name,email,phone}`, `createdAt`, `updatedAt`.
Indexes: `orderId` (unique), `idempotencyKey` (unique), `{studentId: 1, createdAt: -1}`.

**paymentevents** (audit log): `paymentId` (ref), `eventType`, `cfPaymentId`, `payloadHash` (unique), `payload`, `processedAt`.
Index: `payloadHash` (unique, used for webhook deduplication).

MongoDB is schemaless, so there are no SQL migrations. Collections and indexes are created automatically by Mongoose on startup (`autoIndex`). In production, create the indexes above once through a migration script and disable `autoIndex`.

## Key design decisions

- **Idempotency:** `Idempotency-Key` is stored under a unique index. Repeated requests return the same payment, and a key reused with a different payload returns 409. The key is also sent to Cashfree as `x-idempotency-key`.
- **Webhook security:** HMAC signature check on the raw body with a timing-safe comparison.
- **Webhook duplicates:** each event's hash is stored under a unique index, so retries are ignored. If processing fails, the event is rolled back so Cashfree's retry can succeed.
- **Source of truth:** the webhook triggers a verification against the Cashfree API instead of trusting the payload alone. The paid amount must equal the stored amount, otherwise the payment is not marked successful.
- **Monotonic status:** once `SUCCESS`, a payment is never downgraded by late or out-of-order events.
- **Failure handling:** if order creation at Cashfree fails, the record is marked `FAILED` and a 502 is returned. The `sync` endpoint recovers from missed webhooks.
- **Auditability:** every webhook payload is stored in `paymentevents`.

## Known limitations

- No refunds or reconciliation job. A cron calling `sync` for stale `PENDING` payments would be the next step.
- No authentication on the endpoints. In the real UMS they would sit behind the ERP's auth, with the webhook endpoint public.
- Webhook timestamp replay window is not enforced.