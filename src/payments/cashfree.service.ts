import {
  BadGatewayException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { createHmac, timingSafeEqual } from 'crypto';
@Injectable()
export class CashfreeService {
  private client: AxiosInstance;
  constructor(private config: ConfigService) {
    this.client = axios.create({
      baseURL: config.get(
        'CASHFREE_BASE_URL',
        'https://sandbox.cashfree.com/pg',
      ),
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-api-version': config.get('CASHFREE_API_VERSION', '2025-01-01'),
        'x-client-id': config.get('CASHFREE_CLIENT_ID'),
        'x-client-secret': config.get('CASHFREE_CLIENT_SECRET'),
      },
    });
  }
  async createOrder(i: any) {
    try {
      return (
        await this.client.post(
          '/orders',
          {
            order_id: i.orderId,
            order_amount: i.amount,
            order_currency: i.currency,
            customer_details: {
              customer_id: i.studentId,
              customer_name: i.customer.name,
              customer_email: i.customer.email,
              customer_phone: i.customer.phone,
            },
            order_meta: {
              return_url: this.config.get('CASHFREE_RETURN_URL'),
              notify_url: this.config.get('CASHFREE_NOTIFY_URL'),
            },
          },
          { headers: { 'x-idempotency-key': i.idempotencyKey } },
        )
      ).data;
    } catch (e: any) {
      throw new BadGatewayException(
        e?.response?.data || 'Cashfree order creation failed',
      );
    }
  }
  async getOrder(id: string) {
    try {
      return (await this.client.get(`/orders/${encodeURIComponent(id)}`)).data;
    } catch (e: any) {
      throw new BadGatewayException(
        e?.response?.data || 'Cashfree order fetch failed',
      );
    }
  }
  async getPayments(id: string) {
    try {
      return (
        await this.client.get(`/orders/${encodeURIComponent(id)}/payments`)
      ).data;
    } catch (e: any) {
      throw new BadGatewayException(
        e?.response?.data || 'Cashfree payments fetch failed',
      );
    }
  }
  verifyWebhook(
    signature: string | undefined,
    timestamp: string | undefined,
    raw: Buffer,
  ) {
    if (!signature || !timestamp)
      throw new UnauthorizedException('Missing Cashfree webhook signature');
    const secret = this.config.getOrThrow<string>('CASHFREE_CLIENT_SECRET');
    const expected = createHmac('sha256', secret)
      .update(timestamp + raw.toString())
      .digest('base64');
    const a = Buffer.from(signature),
      b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b))
      throw new UnauthorizedException('Invalid Cashfree webhook signature');
  }
}
