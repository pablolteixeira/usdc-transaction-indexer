import { NestFactory } from '@nestjs/core';
import { IndexerModule } from './indexer.module';
import { IndexerService } from './indexer.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(IndexerModule);
  
  const indexer = app.get(IndexerService);

  await indexer.startListening();
}
bootstrap();
