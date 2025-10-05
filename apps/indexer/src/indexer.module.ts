import { Module } from '@nestjs/common';
import { IndexerService } from './indexer.service';
import { ContractModule, EthersModule } from '@app/blockchain';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '@app/database';
import { PruningModule } from '@app/pruning';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({ isGlobal: true }),
    ContractModule,
    EthersModule,
    DatabaseModule,
    PruningModule
  ],
  providers: [IndexerService],
})
export class IndexerModule {}
