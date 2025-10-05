-- CreateTable
CREATE TABLE "Transfer" (
    "id" SERIAL NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "transactionHash" TEXT NOT NULL,
    "blockNumber" INTEGER NOT NULL,
    "blockTimestamp" TIMESTAMP(3) NOT NULL,
    "logIndex" INTEGER NOT NULL,

    CONSTRAINT "Transfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndexerState" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "lastProcessedBlock" INTEGER NOT NULL,
    "lastProcessedBlockHash" TEXT,

    CONSTRAINT "IndexerState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Transfer_fromAddress_idx" ON "Transfer"("fromAddress");

-- CreateIndex
CREATE INDEX "Transfer_toAddress_idx" ON "Transfer"("toAddress");

-- CreateIndex
CREATE UNIQUE INDEX "Transfer_transactionHash_logIndex_key" ON "Transfer"("transactionHash", "logIndex");
