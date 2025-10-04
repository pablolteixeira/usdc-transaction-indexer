import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ethersProvider } from "./ethers.provider";

@Module({
    imports: [ConfigModule],
    providers: [ethersProvider],
    exports: [ethersProvider],
})
export class EthersModule {}