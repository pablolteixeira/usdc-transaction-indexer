import { Injectable, Inject, Logger } from '@nestjs/common';
import { ContractService } from '@app/blockchain/contracts/contract.service';
import { ethers } from 'ethers';

const CONFIRMATION_DEPTH = 10;

@Injectable()
export class IndexerService {
  private readonly logger = new Logger(IndexerService.name);
  private lastProcessedBlock: number = 0;

  constructor(
    @Inject('ETHERS_PROVIDER')
    private readonly provider: ethers.JsonRpcProvider,
    private readonly contractService: ContractService,
  ) {}

  startListening() {
    this.logger.log(`Starting to listen for blocks with a confirmation depth of ${CONFIRMATION_DEPTH}...`);

    this.provider.on('block', async (latestBlockNumber: number) => { 
      this.logger.log(`New tip of the chain detected: #${latestBlockNumber}`);

      const blockToProcess = latestBlockNumber - CONFIRMATION_DEPTH;

      if (blockToProcess <= this.lastProcessedBlock) {
        this.logger.log(`No new blocks to process. Last processed block: #${this.lastProcessedBlock}`);
        return;
      }

      this.logger.log(`Processing finalized block: #${blockToProcess}`);

      try {
        await this.processBlock(blockToProcess);

        this.lastProcessedBlock = blockToProcess;
      } catch (error) {
        this.logger.error(`Failed to process block #${blockToProcess}`, error.stack);
      }
    });
  }

  private async processBlock(blockNumber: number) {
    this.logger.log(`Processing block ${blockNumber} for USDC transfer...`);
    
    const usdcContract = this.contractService.contract;
    const filter = usdcContract.filters.Transfer();
    const events = await usdcContract.queryFilter(filter, blockNumber, blockNumber);

    if (events.length === 0) {
      this.logger.log(`No USDC transfer events found in block ${blockNumber}.`);
      return;
    } else {
      this.logger.log(`Found ${events.length} USDC transfer events in block ${blockNumber}.`);
      
      for (const event of events) {
        const { blockNumber, blockHash } = event;
        const { from, to, value } = event.args;
        this.logger.log(`Block Number: ${blockNumber} - USDC Transfer - From: ${from}, To: ${to}, Value: ${ethers.formatUnits(value, 6)} USDC`);
      }
    }
  }
}
