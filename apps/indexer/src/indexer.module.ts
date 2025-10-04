import { Module } from '@nestjs/common';
import { IndexerService } from './indexer.service';
import { ContractModule, EthersModule } from '@app/blockchain';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ContractModule,
    EthersModule
  ],
  providers: [IndexerService],
})
export class IndexerModule {}
