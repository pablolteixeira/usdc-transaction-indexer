import { Module } from "@nestjs/common";
import { EthersModule } from "../ethers/ethers.module";
import { ContractService } from "./contract.service";

@Module({
    imports: [EthersModule],
    providers: [ContractService],
    exports: [ContractService],
})
export class ContractModule {}