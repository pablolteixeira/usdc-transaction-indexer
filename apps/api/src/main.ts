import { NestFactory } from '@nestjs/core';
import { ApiModule } from './api.module';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(ApiModule);
  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true, 
    transformOptions: {
      enableImplicitConversion: true, 
    },
  }));

  const config = new DocumentBuilder()
    .setTitle('USDC Indexer API')
    .setDescription('API for querying USDC transfer data.')
    .setVersion('1.0')
    .addTag('Transfers', 'Endpoints for querying transfer data')
    .addApiKey( // This defines the API Key security scheme
      {
        type: 'apiKey',
        name: 'x-api-key', // The header name
        in: 'header',
        description: 'API Key for authenticating sensitive endpoints',
      },
      'ApiKeyAuth', // A unique name for this security scheme
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  
  SwaggerModule.setup('api-docs', app, document);

  await app.listen(process.env.port ?? 3000);
  console.log(`🚀 API is running on: ${await app.getUrl()}`);
  console.log(`📚 Swagger UI available at: ${await app.getUrl()}/api-docs`);
}
bootstrap();
