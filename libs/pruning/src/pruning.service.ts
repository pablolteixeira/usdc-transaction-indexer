import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '@app/database';

const DATA_RETENTION_HOURS = 24;

@Injectable()
export class PruningService {
  private readonly logger = new Logger(PruningService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_HOUR, { name: 'pruneOldTransfers' })
  async handleCron() {
    this.logger.log('Running scheduled job to prune old transfers...');

    try {
      const cutoffDate = new Date(
        Date.now() - DATA_RETENTION_HOURS * 60 * 60 * 1000,
      );

      const result = await this.prisma.transfer.deleteMany({
        where: {
          blockTimestamp: {
            lt: cutoffDate,
          },
        },
      });

      if (result.count > 0) {
        this.logger.log(`Successfully pruned ${result.count} old transfer records.`);
      } else {
        this.logger.log('No old transfers to prune.');
      }
    } catch (error) {
      this.logger.error('Error during scheduled pruning job:', error.stack);
    }
  }
}