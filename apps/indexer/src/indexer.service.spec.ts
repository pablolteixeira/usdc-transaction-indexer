import { Test, TestingModule } from '@nestjs/testing';
import { IndexerService } from './indexer.service';
import { ContractService } from '@app/blockchain/contracts/contract.service';
import { PrismaService } from '@app/database';
import { Logger } from '@nestjs/common';
import { ethers } from 'ethers';

const mockPrismaService = {
  indexerState: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
  },
  transfer: {
    createMany: jest.fn(),
    deleteMany: jest.fn().mockResolvedValue({ count: 10 }), 
  },
  $transaction: jest.fn().mockImplementation(async (callback) => {
    return await callback(mockPrismaService);
  }),
};

const mockEthersProvider = {
  getBlock: jest.fn(),
  getBlockNumber: jest.fn(),
};

const mockContract = {
  queryFilter: jest.fn(),
  filters: {
    Transfer: jest.fn(),
  },
};
const mockContractService = {
  contract: mockContract,
};

// Mock the logger to spy on its methods
jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});

describe('IndexerService', () => {
  let service: IndexerService;

  // --- Test Setup ---

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IndexerService,
        { provide: 'ETHERS_PROVIDER', useValue: mockEthersProvider },
        { provide: ContractService, useValue: mockContractService },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<IndexerService>(IndexerService);

    // Use fake timers to control setInterval/setTimeout
    jest.useFakeTimers();
    // Reset all mocks before each test to ensure isolation
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // --- Test for start() method ---

  describe('start', () => {
    it('should initialize and set up an interval to run the processing cycle', () => {
      const runCycleSpy = jest.spyOn(service, 'runProcessingCycle').mockImplementation(async () => {});
      
      service.start();

      expect(Logger.prototype.log).toHaveBeenCalledWith('IndexerService initialized.');
      // It should run once immediately
      expect(runCycleSpy).toHaveBeenCalledTimes(1);

      // Fast-forward time to trigger the interval
      jest.advanceTimersByTime(20000);
      expect(runCycleSpy).toHaveBeenCalledTimes(2);

      jest.advanceTimersByTime(20000);
      expect(runCycleSpy).toHaveBeenCalledTimes(3);

      runCycleSpy.mockRestore();
    });
  });

  // --- Tests for runProcessingCycle() ---

  describe('runProcessingCycle', () => {
    it('should skip processing if another cycle is already running', async () => {
      // Manually set the private property for the test
      (service as any).isProcessing = true;

      await service.runProcessingCycle();

      expect(Logger.prototype.warn).toHaveBeenCalledWith('Previous processing cycle still running. Skipping this interval.');
      expect(mockPrismaService.indexerState.findUnique).not.toHaveBeenCalled();
    });

    it('should perform initial sync if no state exists in the database', async () => {
      // ARRANGE
      const latestBlockNumber = 100000;
      const initialDepth = 50;
      const batchSize = 5;
      
      // No state in DB
      mockPrismaService.indexerState.findUnique.mockResolvedValue(null);
      // Mock chain state
      mockEthersProvider.getBlockNumber.mockResolvedValue(latestBlockNumber);
      mockEthersProvider.getBlock.mockResolvedValue({ hash: '0xfinalhash', number: latestBlockNumber - initialDepth + batchSize -1 });
      // No events found in the first run
      mockContract.queryFilter.mockResolvedValue([]);

      // ACT
      await service.runProcessingCycle();

      // ASSERT
      const expectedStartBlock = latestBlockNumber - initialDepth;
      const expectedFromBlock = expectedStartBlock + 1;
      const expectedToBlock = expectedStartBlock + batchSize;

      expect(Logger.prototype.log).toHaveBeenCalledWith('No existing state found. Calculating dynamic start block...');
      expect(Logger.prototype.log).toHaveBeenCalledWith(`Starting to index from approximately block #${expectedStartBlock}`);
      expect(mockContract.queryFilter).toHaveBeenCalledWith(undefined, expectedFromBlock, expectedToBlock);
      expect(mockPrismaService.indexerState.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { lastProcessedBlock: expectedToBlock, lastProcessedBlockHash: '0xfinalhash' },
          create: { id: 'singleton', lastProcessedBlock: expectedToBlock, lastProcessedBlockHash: '0xfinalhash' },
        }),
      );
      // Ensure the isProcessing flag is reset
      expect((service as any).isProcessing).toBe(false);
    });

    it('should process a batch of blocks with events and update state', async () => {
      // ARRANGE
      const lastProcessedBlock = 1000;
      const latestBlockNumber = 1050;
      const batchSize = 5;
      const toBlock = lastProcessedBlock + batchSize;

      // Mock DB state
      mockPrismaService.indexerState.findUnique.mockResolvedValue({
        id: 'singleton',
        lastProcessedBlock: lastProcessedBlock,
        lastProcessedBlockHash: '0xhash1000',
      });
      // Mock chain state
      mockEthersProvider.getBlockNumber.mockResolvedValue(latestBlockNumber);
      mockEthersProvider.getBlock
        .mockResolvedValueOnce({ hash: '0xhash1000', number: 1000 }) // Integrity check
        .mockResolvedValueOnce({ hash: '0xfinalhash1005', number: toBlock, timestamp: 1672531200 }) // Final block in batch
        .mockResolvedValue({ number: 1002, timestamp: 1672531100 }); // Block for event

      // Mock event
      const mockEvent = {
        blockNumber: 1002,
        transactionHash: '0x-tx-hash',
        index: 1,
        args: { from: '0xfrom', to: '0xto', value: ethers.parseEther('10') },
      };
      mockContract.queryFilter.mockResolvedValue([mockEvent]);
      
      // ACT
      await service.runProcessingCycle();

      // ASSERT
      expect(mockContract.queryFilter).toHaveBeenCalledWith(undefined, 1001, 1005);
      expect(mockPrismaService.transfer.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            fromAddress: '0xfrom',
            toAddress: '0xto',
            amount: '10000000000000000000',
            blockNumber: 1002,
            transactionHash: '0x-tx-hash',
          }),
        ]),
      });
      expect(mockPrismaService.indexerState.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { lastProcessedBlock: 1005, lastProcessedBlockHash: '0xfinalhash1005' },
        }),
      );
    });

    it('should update state even if no events are found', async () => {
        // ARRANGE
        const lastProcessedBlock = 2000;
        const latestBlockNumber = 2050;
        const toBlock = lastProcessedBlock + 5; // BATCH_SIZE

        mockPrismaService.indexerState.findUnique.mockResolvedValue({
            id: 'singleton', lastProcessedBlock: lastProcessedBlock, lastProcessedBlockHash: '0xhash2000'
        });
        mockEthersProvider.getBlockNumber.mockResolvedValue(latestBlockNumber);
        mockEthersProvider.getBlock
            .mockResolvedValueOnce({ hash: '0xhash2000', number: 2000 })
            .mockResolvedValueOnce({ hash: '0xfinalhash2005', number: toBlock });
        
        // No events
        mockContract.queryFilter.mockResolvedValue([]);

        // ACT
        await service.runProcessingCycle();

        // ASSERT
        expect(mockContract.queryFilter).toHaveBeenCalledWith(undefined, 2001, 2005);
        expect(mockPrismaService.transfer.createMany).not.toHaveBeenCalled();
        expect(mockPrismaService.indexerState.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            update: { lastProcessedBlock: 2005, lastProcessedBlockHash: '0xfinalhash2005' },
          }),
        );
        expect(Logger.prototype.log).toHaveBeenCalledWith('No events found, but updated state to #2005.');
    });

    it('should do nothing if there are no new finalized blocks', async () => {
        // ARRANGE
        const lastProcessedBlock = 3000;
        // latest is only 5 blocks ahead, less than CONFIRMATION_DEPTH (10)
        const latestBlockNumber = 3005; 

        mockPrismaService.indexerState.findUnique.mockResolvedValue({
            id: 'singleton', lastProcessedBlock: lastProcessedBlock, lastProcessedBlockHash: '0xhash3000'
        });
        mockEthersProvider.getBlockNumber.mockResolvedValue(latestBlockNumber);
        mockEthersProvider.getBlock.mockResolvedValueOnce({ hash: '0xhash3000', number: 3000 });
        
        // ACT
        await service.runProcessingCycle();

        // ASSERT
        expect(Logger.prototype.log).toHaveBeenCalledWith('No new finalized blocks to process. Last processed: #3000');
        expect(mockContract.queryFilter).not.toHaveBeenCalled();
    });

    it('should correctly handle a processing error and reset the isProcessing flag', async () => {
      // ARRANGE
      mockPrismaService.indexerState.findUnique.mockRejectedValue(new Error('DB connection failed'));

      // ACT
      await service.runProcessingCycle();

      // ASSERT
      expect(Logger.prototype.error).toHaveBeenCalledWith('Error during processing cycle:', expect.any(String));
      expect((service as any).isProcessing).toBe(false);
    });
  });

  // --- Tests for Reorg Handling ---

  describe('Reorg Handling', () => {
    it('should detect a reorg and roll back the database state', async () => {
    // ARRANGE
    const staleBlockNumber = 4000;
    const commonAncestor = staleBlockNumber - 10; // CONFIRMATION_DEPTH is 10

    // Mock the DB state that will be found by the service
    mockPrismaService.indexerState.findUnique
        .mockResolvedValue({ // This will be used by both the main cycle and the reorg handler
        id: 'singleton',
        lastProcessedBlock: staleBlockNumber,
        lastProcessedBlockHash: '0xOLD_HASH_4000',
        });
        
    mockEthersProvider.getBlockNumber.mockResolvedValue(4050);

    // Be VERY specific about which block number returns what
    mockEthersProvider.getBlock.mockImplementation(async (blockNumber) => {
        if (blockNumber === staleBlockNumber) {
        // For the initial check AND the check inside the handler for block 4000
        return { hash: '0xNEW_HASH_4000', number: staleBlockNumber };
        }
        if (blockNumber === commonAncestor) {
        // For the parent block check inside the handler for block 3990
        return { hash: '0xANCESTOR_HASH_3990', number: commonAncestor };
        }
        if (blockNumber === commonAncestor + 5) { // The 'toBlock' of the new batch
        return { hash: '0xfinalhash3995', number: commonAncestor + 5 };
        }
        return null; // Return null for any other unexpected calls
    });

    mockContract.queryFilter.mockResolvedValue([]);

    // ACT
    await service.runProcessingCycle();

    // ASSERT
    expect(Logger.prototype.warn).toHaveBeenCalledWith(`Reorg detected! Last known block #${staleBlockNumber} with hash 0xOLD_HASH_4000 is no longer on the main chain.`);
    
    // Check that DB was rolled back
    expect(mockPrismaService.transfer.deleteMany).toHaveBeenCalledWith({
        where: { blockNumber: { gt: commonAncestor } },
    });
    
    // This is the key assertion that was failing
    expect(mockPrismaService.indexerState.update).toHaveBeenCalledWith({
        where: { id: 'singleton' },
        data: {
        lastProcessedBlock: commonAncestor,
        lastProcessedBlockHash: '0xANCESTOR_HASH_3990',
        },
    });

    // Check that it then processed from the new starting point
    expect(mockContract.queryFilter).toHaveBeenCalledWith(undefined, commonAncestor + 1, commonAncestor + 5);
    expect(mockPrismaService.indexerState.upsert).toHaveBeenCalled();
    });
  });

  // --- Tests for RPC Retries ---

  describe('retryRpcCall', () => {
    // FIX: Add a spy for the private 'sleep' method to prevent test timeouts.
    let sleepSpy: jest.SpyInstance;

    beforeAll(() => {
      sleepSpy = jest
        .spyOn(IndexerService.prototype as any, 'sleep')
        .mockResolvedValue(undefined); // Make sleep resolve immediately
    });
  
    afterAll(() => {
      sleepSpy.mockRestore(); // Clean up the spy
    });

    it('should retry a failed RPC call with a retriable error code and eventually succeed', async () => {
        // ARRANGE
        const error = new Error('Network timeout');
        (error as any).code = 'TIMEOUT';
        
        // FIX: Update mock to handle all 4 calls
        mockEthersProvider.getBlockNumber
        .mockRejectedValueOnce(error)       // Call #1 (fails)
        .mockRejectedValueOnce(error)       // Call #2 (fails)
        .mockResolvedValueOnce(5000)        // Call #3 (succeeds for initial block)
        .mockResolvedValueOnce(5000);       // Call #4 (succeeds for finalized block)

        mockPrismaService.indexerState.findUnique.mockResolvedValue(null);
        mockContract.queryFilter.mockResolvedValue([]);
        mockEthersProvider.getBlock.mockResolvedValue({ hash: '0xhash' });
        
        // ACT
        await service.runProcessingCycle();

        // ASSERT
        // FIX: Update assertion to expect 4 calls
        expect(mockEthersProvider.getBlockNumber).toHaveBeenCalledTimes(4);
        
        expect(Logger.prototype.warn).toHaveBeenCalledWith(expect.stringContaining('RPC call failed (attempt 1/5). Retrying'));
        expect(Logger.prototype.warn).toHaveBeenCalledWith(expect.stringContaining('RPC call failed (attempt 2/5). Retrying'));
        expect(mockPrismaService.indexerState.upsert).toHaveBeenCalled(); // The cycle completed
        expect(sleepSpy).toHaveBeenCalledTimes(2); // Check that it attempted to wait
    });

    it('should fail immediately on a non-retriable error', async () => {
        // ARRANGE
        const error = new Error('Invalid params'); // No special error code

        mockEthersProvider.getBlockNumber.mockRejectedValue(error);
        mockPrismaService.indexerState.findUnique.mockResolvedValue(null);

        // ACT
        await service.runProcessingCycle();

        // ASSERT
        expect(mockEthersProvider.getBlockNumber).toHaveBeenCalledTimes(1);
        expect(Logger.prototype.error).toHaveBeenCalledWith('RPC call failed with a non-retriable error: Invalid params');
        expect(Logger.prototype.error).toHaveBeenCalledWith('Error during processing cycle:', expect.any(String));
        // The cycle should NOT have completed
        expect(mockPrismaService.indexerState.upsert).not.toHaveBeenCalled();
        expect(sleepSpy).not.toHaveBeenCalled(); // Check that it did not attempt to wait/retry
    });
  });
});