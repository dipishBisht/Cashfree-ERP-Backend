import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {rawBody: true});
  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const c = new DocumentBuilder()
    .setTitle("TrainX Cashfree Payment API")
    .setVersion("1.0")
    .build();
    SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, c));
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
