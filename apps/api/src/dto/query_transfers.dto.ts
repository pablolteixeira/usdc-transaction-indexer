import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsInt, IsOptional, IsString, Max, Min, IsEthereumAddress } from 'class-validator';

export class QueryTransfersDto {
  @ApiProperty({
    required: false,
    default: 1,
    description: 'The page number for pagination.',
  })  
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({
    required: false,
    default: 20,
    maximum: 100,
    description: 'The number of items to return per page.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiProperty({ required: false, description: 'Filter transfers by the sender address.' })
  @IsOptional()
  @IsEthereumAddress()
  @IsOptional()
  @IsEthereumAddress()
  fromAddress?: string;

  @ApiProperty({ required: false, description: 'Filter transfers by the recipient address.' })
  @IsOptional()
  @IsEthereumAddress()
  toAddress?: string;

  @ApiProperty({
    required: false,
    description: 'Filter transfers with an amount greater than or equal to this value.',
    example: '1000000', // Example for 1 USDC (since USDC has 6 decimals)
  })
  @IsOptional()
  @IsString()
  minAmount?: string;
  
  @ApiProperty({
    required: false,
    description: 'Filter transfers that occurred on or after this date.',
    example: '2023-10-26T00:00:00.000Z',
    type: 'string',
    format: 'date-time',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date;
  
  @ApiProperty({
    required: false,
    description: 'Filter transfers that occurred on or before this date (ISO 8601 format).',
    example: '2023-10-27T23:59:59.000Z',
    type: 'string',
    format: 'date-time',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;
}