import { Test, TestingModule } from '@nestjs/testing';
import { PruningService } from './pruning.service';
import { PrismaService } from '@app/database';

const mockPrismaService = {
  // Add mock functions for whatever prisma methods PruningService uses
  transfer: {
    deleteMany: jest.fn(),
  },
};

describe('PruningService', () => {
  let service: PruningService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PruningService,
        // Provide the mock for PrismaService
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<PruningService>(PruningService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});