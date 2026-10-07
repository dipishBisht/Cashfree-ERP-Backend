import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { CashfreeService } from './cashfree.service.js';
import { Payment, PaymentSchema } from './schemas/payment.schema.js';
import {
  PaymentEvent,
  PaymentEventSchema,
} from './schemas/payment-event.schema.js';
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Payment.name, schema: PaymentSchema },
      { name: PaymentEvent.name, schema: PaymentEventSchema },
    ]),
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService, CashfreeService],
})
export class PaymentsModule {}
