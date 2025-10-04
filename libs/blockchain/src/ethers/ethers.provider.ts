import { ConfigService } from "@nestjs/config";
import { ethers } from "ethers";

export const ethersProvider = {
    provide: 'ETHERS_PROVIDER',

    inject: [ConfigService],

    useFactory: (configService: ConfigService) => {
        const rpcUrl = configService.get<string>('RPC_URL');    
        if (!rpcUrl) {
            throw new Error('RPC_URL is not set in the .env file');
        }

        return new ethers.JsonRpcProvider(rpcUrl);
    }
}