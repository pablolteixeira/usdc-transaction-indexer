import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common';
import { ContractService } from '@app/blockchain/contracts/contract.service';
import { ethers } from 'ethers';
import { PrismaService } from '@app/database';

const INITIAL_DEPTH = 50
const CONFIRMATION_DEPTH = 10;
const POOLING_INTERVAL_MS = 20000;
const BATCH_SIZE = 5;

const RETRY_ATTEMPTS = 5;
const RETRY_DELAY_MS = 1000;

@Injectable()
export class IndexerService {
  private readonly logger = new Logger(IndexerService.name);
  private isProcessing = false;

  constructor(
    @Inject('ETHERS_PROVIDER')
    private readonly provider: ethers.JsonRpcProvider,
    private readonly contractService: ContractService,
    private readonly prisma: PrismaService
  ) {}

  start() {
    this.logger.log('IndexerService initialized.');

    this.runProcessingCycle();
    setInterval(() => this.runProcessingCycle(), POOLING_INTERVAL_MS);
  }

  async runProcessingCycle() {
    if (this.isProcessing) {
      this.logger.warn('Previous processing cycle still running. Skipping this interval.');
      return;
    }

    this.isProcessing = true;

    try {
      const state = await this.prisma.indexerState.findUnique({
        where: { id: 'singleton' },
      });

      let lastProcessedBlock: number;

      if (state && state.lastProcessedBlock) {
        this.logger.log(`Verifying integrity of last processed block #${state.lastProcessedBlock}`);
        const lastBlockFromChain = await this.retryRpcCall(() => 
          this.provider.getBlock(state.lastProcessedBlock)
        );
        
        if (!lastBlockFromChain || lastBlockFromChain.hash !== state.lastProcessedBlockHash) {
          this.logger.warn(`Reorg detected! Last known block #${state.lastProcessedBlock} with hash ${state.lastProcessedBlockHash} is no longer on the main chain.`);
          lastProcessedBlock = await this.handleReorg(state.lastProcessedBlock);
        } else {
          lastProcessedBlock = state.lastProcessedBlock;
          this.logger.log(`No reorg detected. Continuing from block #${lastProcessedBlock}`);
        }
      } else {
        this.logger.log('No existing state found. Calculating dynamic start block...');
        const latestBlockNumber = await this.retryRpcCall(() => this.provider.getBlockNumber());
        lastProcessedBlock = latestBlockNumber - INITIAL_DEPTH;
        this.logger.log(`Starting to index from approximately block #${lastProcessedBlock}`);
      }

      const latestBlockNumber = await this.retryRpcCall(() => this.provider.getBlockNumber());
      const finalizedBlockNumber = latestBlockNumber - CONFIRMATION_DEPTH;

      if (finalizedBlockNumber <= lastProcessedBlock) {
        this.logger.log(`No new finalized blocks to process. Last processed: #${lastProcessedBlock}`);
        return;
      }

      const fromBlock = lastProcessedBlock + 1;
      const toBlock = Math.min(finalizedBlockNumber, fromBlock + BATCH_SIZE - 1);

      this.logger.log(`Processing blocks from #${fromBlock} to #${toBlock}`);

      const events = await this.retryRpcCall(() => 
        this.getEventsForBlockRange(fromBlock, toBlock)
      );

      this.logger.log(`Found ${events.length} total transfer events in this range.`);

      const finalBlockInBatch = await this.retryRpcCall(() => this.provider.getBlock(toBlock));
      if (!finalBlockInBatch) {
        throw new Error(`Failed to fetch final block in batch: #${toBlock}`);
      }
      const finalBlockHash = finalBlockInBatch.hash;

      if (events.length > 0) {
        const blockNumbers = [... new Set(events.map(event => event.blockNumber))];
        const blocks = await this.retryRpcCall(() =>
          Promise.all(blockNumbers.map(num => this.provider.getBlock(num)))
        );

        const timestampMap = new Map<number, Date>();
        for (const block of blocks) {
          if (block) {
            timestampMap.set(block.number, new Date(block.timestamp * 1000));
          }
        }

        const transfersToCreate = events.map(event => {
          const eventLog = event as ethers.EventLog
         
          return {
            fromAddress: eventLog.args.from,
            toAddress: eventLog.args.to,
            amount: eventLog.args.value.toString(),
            transactionHash: eventLog.transactionHash,
            blockNumber: eventLog.blockNumber,
            logIndex: eventLog.index,
            blockTimestamp: timestampMap.get(eventLog.blockNumber) || new Date(0),
          };
        });

        await this.prisma.$transaction(async (prisma) => {
          await prisma.transfer.createMany({
            data: transfersToCreate,
          });

          await prisma.indexerState.upsert({
            where: { id: 'singleton' },
            update: { lastProcessedBlock: toBlock, lastProcessedBlockHash: finalBlockHash },
            create: { id: 'singleton', lastProcessedBlock: toBlock, lastProcessedBlockHash: finalBlockHash },
          });
        });

        this.logger.log(`Successfully processed and saved transfers up to block #${toBlock}.`);
      } else {
        await this.prisma.indexerState.upsert({
            where: { id: 'singleton' },
            update: { lastProcessedBlock: toBlock, lastProcessedBlockHash: finalBlockHash },
            create: { id: 'singleton', lastProcessedBlock: toBlock, lastProcessedBlockHash: finalBlockHash },
        });
        this.logger.log(`No events found, but updated state to #${toBlock}.`);
      }
    } catch (error) {
      this.logger.error('Error during processing cycle:', error.stack);
    } finally {
      this.isProcessing = false;
    }
  }

  private async getEventsForBlockRange(fromBlock: number, toBlock: number) {
      const usdcContract = this.contractService.contract;
      const filter = usdcContract.filters.Transfer();
      return await usdcContract.queryFilter(filter, fromBlock, toBlock);
  }

  private async handleReorg(staleBlockNumber: number): Promise<number> {
    let currentBlockNumber = staleBlockNumber;
    let commonAncestorFound = false;

    while (!commonAncestorFound && currentBlockNumber > 0) {
      const state = await this.prisma.indexerState.findUnique({ where: { id: 'singleton' } });
      const blockFromChain = await this.provider.getBlock(currentBlockNumber);
      
      if (blockFromChain && state) {
        const parentBlockFromChain = await this.provider.getBlock(currentBlockNumber - CONFIRMATION_DEPTH);
        if (parentBlockFromChain) {
            const commonAncestorBlockNumber = parentBlockFromChain.number;
            this.logger.log(`Found a likely common ancestor at block #${commonAncestorBlockNumber}. Rolling back database...`);

            const { count } = await this.prisma.transfer.deleteMany({
                where: { blockNumber: { gt: commonAncestorBlockNumber } },
            });
            this.logger.log(`Deleted ${count} stale transfer records.`);

            await this.prisma.indexerState.update({
                where: { id: 'singleton' },
                data: {
                    lastProcessedBlock: commonAncestorBlockNumber,
                    lastProcessedBlockHash: parentBlockFromChain.hash,
                },
            });
            
            return commonAncestorBlockNumber;
        }
      }
      currentBlockNumber--;
    }
    
    this.logger.error('Could not find common ancestor after walking back. Manual intervention may be required.');

    const latestBlock = await this.provider.getBlockNumber();
    return latestBlock - INITIAL_DEPTH;
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async retryRpcCall<T>(operation: () => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
      try {
        return await operation();
      } catch (error) {
        // Only retry on specific, transient network errors
        if (error.code === 'NETWORK_ERROR' || error.code === 'SERVER_ERROR' || error.code === 'TIMEOUT' || error.code === 'EAI_AGAIN') {
          if (attempt === RETRY_ATTEMPTS - 1) {
            this.logger.error(`RPC call failed after ${RETRY_ATTEMPTS} attempts. Giving up for this cycle.`);
            throw error; // Rethrow the error to be caught by the main try/catch
          }
          const delay = RETRY_DELAY_MS * Math.pow(2, attempt); // Exponential backoff
          this.logger.warn(`RPC call failed (attempt ${attempt + 1}/${RETRY_ATTEMPTS}). Retrying in ${delay / 1000}s... Error: ${error.message}`);
          await this.sleep(delay);
        } else {
          // Don't retry on non-network errors (e.g., bad arguments)
          this.logger.error(`RPC call failed with a non-retriable error: ${error.message}`);
          throw error;
        }
      }
    }
    // This line should be unreachable, but it's required for TypeScript
    throw new Error('Exhausted all retry attempts.');
  }
}

