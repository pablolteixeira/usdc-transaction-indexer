import { Injectable, NotFoundException } from '@nestjs/common';
import { QueryTransfersDto } from './dto/query_transfers.dto';
import { PrismaService } from '@app/database';

import { Prisma } from '../../../generated/prisma/client';

@Injectable()
export class ApiService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: QueryTransfersDto) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const { fromAddress, toAddress, minAmount, startDate, endDate } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.TransferWhereInput = {};

    if (fromAddress) where.fromAddress = fromAddress;
    if (toAddress) where.toAddress = toAddress;
    if (minAmount) where.amount = { gte: minAmount };
    if (endDate || endDate) { 
      where.blockTimestamp = {
        gte: startDate,
        lte: endDate
      };
    }
    const [transfers, total] = await this.prisma.$transaction([
      this.prisma.transfer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { blockNumber: 'desc' },
      }),
      this.prisma.transfer.count({ where }),
    ]);

    return {
      data: transfers,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getBalance(address: string) {
    const sentTransfers = await this.prisma.transfer.findMany({ where: { fromAddress: address }, select: { amount: true } });
    const receivedTransfers = await this.prisma.transfer.findMany({ where: { toAddress: address }, select: { amount: true } });

    const totalSent = sentTransfers.reduce((sum, t) => sum + BigInt(t.amount), BigInt(0));
    const totalReceived = receivedTransfers.reduce((sum, t) => sum + BigInt(t.amount), BigInt(0));

    const balance = totalReceived - totalSent;

    return { address, balance: balance.toString() };
  }

  async getHistory(address: string, page: number = 1, limit: number = 20) {
    const where: Prisma.TransferWhereInput = {
      OR: [{ fromAddress: address }, { toAddress: address }],
    };
    const skip = (page - 1) * limit;

    const [transfers, total] = await this.prisma.$transaction([
      this.prisma.transfer.findMany({ where, skip, take: limit, orderBy: { blockNumber: 'desc' }}),
      this.prisma.transfer.count({ where }),
    ]);
    
    return {
      data: transfers,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}