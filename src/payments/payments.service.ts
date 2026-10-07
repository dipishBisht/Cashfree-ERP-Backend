import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createHash, randomUUID } from 'crypto';
import { CashfreeService } from './cashfree.service.js';
import { CreatePaymentDto } from './dto/create-payment.dto.js';
import {
  Payment,
  PaymentDocument,
  PaymentStatus,
} from './schemas/payment.schema.js';
import {
  PaymentEvent,
  PaymentEventDocument,
} from './schemas/payment-event.schema.js';
@Injectable()
export class PaymentsService {
  constructor(
    @InjectModel(Payment.name) private payments: Model<PaymentDocument>,
    @InjectModel(PaymentEvent.name) private events: Model<PaymentEventDocument>,
    private cashfree: CashfreeService,
  ) {}
  async create(dto: CreatePaymentDto, key: string) {
    if (!key) throw new ConflictException('Idempotency-Key header is required');
    const old = await this.payments.findOne({ idempotencyKey: key });
    if (old) return this.checkSame(old, dto);
    const orderId = 'TXN_' + randomUUID().replace(/-/g, '').slice(0, 20);
    let p: PaymentDocument;
    try {
      p = await this.payments.create({
        orderId,
        studentId: dto.studentId,
        amount: dto.amount,
        currency: dto.currency || 'INR',
        customer: dto.customer,
        idempotencyKey: key,
        status: PaymentStatus.INITIATING,
      });
    } catch (e: any) {
      if (e?.code === 11000) {
        const x = await this.payments.findOne({ idempotencyKey: key });
        if (x) return this.checkSame(x, dto);
      }
      throw e;
    }
    try {
      const cf = await this.cashfree.createOrder({
        orderId,
        amount: dto.amount,
        currency: dto.currency || 'INR',
        studentId: dto.studentId,
        customer: dto.customer,
        idempotencyKey: key,
      });
      p.cfOrderId = cf.cf_order_id;
      p.paymentSessionId = cf.payment_session_id;
      p.status = PaymentStatus.PENDING;
      await p.save();
      return this.out(p);
    } catch (e) {
      p.status = PaymentStatus.FAILED;
      p.failureReason = 'Cashfree order creation failed';
      await p.save();
      throw e;
    }
  }
  async get(id: string) {
    const p = await this.payments.findOne({ orderId: id });
    if (!p) throw new NotFoundException('Payment not found');
    return this.out(p);
  }
  async sync(id: string) {
    const p = await this.payments.findOne({ orderId: id });
    if (!p) throw new NotFoundException('Payment not found');
    const [o, ps] = await Promise.all([
      this.cashfree.getOrder(id),
      this.cashfree.getPayments(id),
    ]);
    const s = (Array.isArray(ps) ? ps : []).map((x: any) => x.payment_status);
    let next = this.resolve(o?.order_status, s);

    const latest = Array.isArray(ps) && ps.length ? ps[ps.length - 1] : null;
    if (latest) {
      p.cfPaymentId = latest.cf_payment_id;
      p.paymentMethod = latest.payment_group;
      p.failureReason = latest.payment_message;
    }

    if (
      next === PaymentStatus.SUCCESS &&
      Number(o?.order_amount) !== p.amount
    ) {
      next = PaymentStatus.FAILED;
      p.failureReason = 'Amount mismatch';
    }

    p.status = this.monotonic(p.status, next);
    await p.save();
    return this.out(p);
  }

  async webhook(body: any, raw?: Buffer) {
    const id = body?.data?.order?.order_id;
    if (!id) throw new ConflictException('Invalid Cashfree webhook payload');
    const p = await this.payments.findOne({ orderId: id });
    if (!p) throw new NotFoundException('Payment not found for webhook');
    const hash = createHash('sha256')
      .update(raw ?? JSON.stringify(body))
      .digest('hex');
    let ev: any;
    try {
      ev = await this.events.create({
        paymentId: p._id,
        eventType: body.type || 'UNKNOWN',
        cfPaymentId: body?.data?.payment?.cf_payment_id,
        payloadHash: hash,
        payload: body,
        processedAt: new Date(),
      });
    } catch (e: any) {
      if (e?.code === 11000) return { message: 'Duplicate webhook ignored' };
      throw e;
    }
    try {
      const r = await this.sync(id); // verify with Cashfree API (source of truth)
      return { message: 'Webhook processed', status: r.status };
    } catch (e) {
      await this.events.deleteOne({ _id: ev._id }); // allow Cashfree retry
      throw e;
    }
  }

  async listByStudent(studentId: string) {
    const rows = await this.payments
      .find({ studentId })
      .sort({ createdAt: -1 });
    return rows.map((p) => this.out(p));
  }

  private map(s?: string, t?: string) {
    if (t === 'PAYMENT_SUCCESS_WEBHOOK' || s === 'SUCCESS')
      return PaymentStatus.SUCCESS;
    if (s === 'FAILED') return PaymentStatus.FAILED;
    if (['CANCELLED', 'USER_DROPPED', 'VOID'].includes(s || ''))
      return PaymentStatus.CANCELLED;
    if (s === 'EXPIRED') return PaymentStatus.EXPIRED;
    return PaymentStatus.PENDING;
  }

  private resolve(o?: string, s: string[] = []) {
    if (s.includes('SUCCESS') || o === 'PAID') return PaymentStatus.SUCCESS;
    if (s.includes('FAILED')) return PaymentStatus.FAILED;
    if (
      s.some((x) => ['CANCELLED', 'USER_DROPPED', 'VOID'].includes(x)) ||
      ['TERMINATED', 'TERMINATION_REQUESTED'].includes(o || '')
    )
      return PaymentStatus.CANCELLED;
    if (o === 'EXPIRED' || s.includes('EXPIRED')) return PaymentStatus.EXPIRED;
    return PaymentStatus.PENDING;
  }

  private monotonic(c: PaymentStatus, n: PaymentStatus) {
    return c === PaymentStatus.SUCCESS ? c : n;
  }

  private out(p: PaymentDocument) {
    return {
      paymentId: p._id,
      orderId: p.orderId,
      cfOrderId: p.cfOrderId,
      paymentSessionId: p.paymentSessionId,
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      cfPaymentId: p.cfPaymentId,
      failureReason: p.failureReason,
    };
  }

  private checkSame(old: PaymentDocument, dto: CreatePaymentDto) {
    if (old.studentId !== dto.studentId || old.amount !== dto.amount)
      throw new ConflictException(
        'Idempotency-Key reused with different payload',
      );
    return this.out(old);
  }
}
