import { Test, TestingModule } from '@nestjs/testing';
import { ApiController } from './api.controller';
import { ApiService } from './api.service';
import { QueryTransfersDto } from './dto/query_transfers.dto';
import { ThrottlerGuard } from '@nestjs/throttler';

const mockApiService = {
  findAll: jest.fn(),
  getBalance: jest.fn(),
  getHistory: jest.fn(),
};

describe('ApiController', () => {
  let controller: ApiController;
  let service: ApiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ApiController],
      providers: [
        {
          provide: ApiService,
          useValue: mockApiService,
        },
      ],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ApiController>(ApiController);
    service = module.get<ApiService>(ApiService);
    
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should call apiService.findAll with the correct query DTO', async () => {
      // Arrange: Set up our inputs and expected outputs
      const queryDto = new QueryTransfersDto();
      queryDto.page = 2;
      queryDto.limit = 50;

      const mockResponse = { data: [], meta: { total: 0, page: 2, limit: 50, totalPages: 0 } };
      mockApiService.findAll.mockResolvedValue(mockResponse);

      // Act: Call the controller method
      const result = await controller.findAll(queryDto);

      // Assert: Verify the interaction and the result
      expect(service.findAll).toHaveBeenCalledWith(queryDto);
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getBalance', () => {
    it('should call apiService.getBalance with the correct address', async () => {
      // Arrange
      const testAddress = '0x1234567890abcdef1234567890abcdef12345678';
      const mockResponse = { address: testAddress, balance: '1000000' };
      mockApiService.getBalance.mockResolvedValue(mockResponse);

      // Act
      const result = await controller.getBalance(testAddress);

      // Assert
      expect(service.getBalance).toHaveBeenCalledWith(testAddress);
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getHistory', () => {
    it('should call apiService.getHistory with correct address, page, and limit', async () => {
      // Arrange
      const testAddress = '0xabcdef1234567890abcdef1234567890abcdef12';
      const page = 3;
      const limit = 15;
      const mockResponse = { data: [], meta: { total: 0, page: 3, limit: 15, totalPages: 0 } };
      mockApiService.getHistory.mockResolvedValue(mockResponse);

      // Act
      const result = await controller.getHistory(testAddress, page, limit);

      // Assert
      expect(service.getHistory).toHaveBeenCalledWith(testAddress, page, limit);
      expect(result).toEqual(mockResponse);
    });
  });
});