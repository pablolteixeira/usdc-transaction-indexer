import { Controller, Get, Post, Body, Param, Query, UseGuards, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { ApiService } from './api.service';
import { QueryTransfersDto } from './dto/query_transfers.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiSecurity } from '@nestjs/swagger';

@ApiTags('Transfers')
@Controller('transfers')
export class ApiController {
  constructor(private readonly transfersService: ApiService) {}

  @Get()
  @ApiOperation({ summary: 'Query and filter all indexed transfers' })
  @ApiResponse({ status: 200, description: 'A paginated list of transfers.' })
  @ApiResponse({ status: 400, description: 'Invalid query parameters.' })
  findAll(@Query() query: QueryTransfersDto) {
    return this.transfersService.findAll(query);
  }

  @Get('balance/:address')
  @ApiOperation({ summary: 'Get the calculated USDC balance for an address' })
  @ApiParam({ name: 'address', description: 'The wallet address to check', example: '0x...' })
  @ApiResponse({ status: 200, description: 'Returns the address and its balance.' })
  @ApiResponse({ status: 400, description: 'Invalid address format.' })
  getBalance(@Param('address') address: string) {
    return this.transfersService.getBalance(address);
  }

  @Get('history/:address')
  @ApiOperation({ summary: 'Get the transfer history for a specific address' })
  @ApiParam({ name: 'address', description: 'The wallet address to get history for' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number for pagination' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of results per page' })
  @ApiResponse({ status: 200, description: 'A paginated list of transfers for the address.' })
  @ApiResponse({ status: 400, description: 'Invalid address or query parameters.' })
  getHistory(
    @Param('address') address: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.transfersService.getHistory(address, page, limit);
  }
}