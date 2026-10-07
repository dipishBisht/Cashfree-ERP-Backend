import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
export type PaymentEventDocument = HydratedDocument<PaymentEvent>;
@Schema({ timestamps: true })
export class PaymentEvent {
  @Prop({ type: Types.ObjectId, ref: 'Payment', required: true, index: true })
  paymentId: Types.ObjectId;
  @Prop({ required: true }) eventType: string;
  @Prop() cfPaymentId?: string;
  @Prop({ required: true, unique: true, index: true }) payloadHash: string;
  @Prop({ type: Object, required: true }) payload: Record<string, any>;
  @Prop() processedAt?: Date;
}
export const PaymentEventSchema = SchemaFactory.createForClass(PaymentEvent);
