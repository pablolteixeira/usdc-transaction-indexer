import { Module } from '@nestjs/common';
import { PruningService } from './pruning.service';
import { DatabaseModule } from '@app/database';

@Module({
  imports: [DatabaseModule],
  providers: [PruningService],
})
export class PruningModule {}