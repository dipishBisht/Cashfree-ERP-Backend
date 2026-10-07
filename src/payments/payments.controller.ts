import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { PaymentsService } from './payments.service.js';
import { CashfreeService } from './cashfree.service.js';
import { CreatePaymentDto } from './dto/create-payment.dto.js';
@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(
    private service: PaymentsService,
    private cashfree: CashfreeService,
  ) {}
  @Post('orders')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  create(
    @Body() dto: CreatePaymentDto,
    @Headers('idempotency-key') key: string,
  ) {
    return this.service.create(dto, key);
  }
  @Get(':orderId') get(@Param('orderId') id: string) {
    return this.service.get(id);
  }
  @Post(':orderId/sync') sync(@Param('orderId') id: string) {
    return this.service.sync(id);
  }
  @Post('webhook/cashfree') @HttpCode(200) webhook(@Req() req: Request) {
    const raw = (req as any).rawBody as Buffer;
    this.cashfree.verifyWebhook(
      req.headers['x-webhook-signature'] as string,
      req.headers['x-webhook-timestamp'] as string,
      raw,
    );
    return this.service.webhook(req.body, raw);
  }
  @Get('student/:studentId') list(@Param('studentId') id: string) {
    return this.service.listByStudent(id);
  }
}
