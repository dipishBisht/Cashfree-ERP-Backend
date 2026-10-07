import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
export type PaymentDocument = HydratedDocument<Payment>;
export enum PaymentStatus {
  INITIATING = 'INITIATING',
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}
@Schema({ timestamps: true })
export class Payment {
  @Prop({ required: true, unique: true }) orderId: string;
  @Prop() cfOrderId?: string;
  @Prop({ required: true }) studentId: string;
  @Prop({ required: true, min: 1 }) amount: number;
  @Prop({ required: true, default: 'INR' }) currency: string;
  @Prop({
    required: true,
    enum: PaymentStatus,
    default: PaymentStatus.INITIATING,
  })
  status: PaymentStatus;
  @Prop() paymentSessionId?: string;
  @Prop() cfPaymentId?: string;
  @Prop() paymentMethod?: string;
  @Prop() failureReason?: string;
  @Prop({ required: true, unique: true, index: true }) idempotencyKey: string;
  @Prop({ type: Object, required: true }) customer: {
    name: string;
    email: string;
    phone: string;
  };
}
export const PaymentSchema = SchemaFactory.createForClass(Payment);
PaymentSchema.index({ studentId: 1, createdAt: -1 });
