import { Injectable, Inject } from "@nestjs/common";
import { ethers } from "ethers";
import abi from './abis/usdc.json';

const USDC_PROXY_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

@Injectable()
export class ContractService {
    public readonly contract: ethers.Contract;
    
    constructor(
        @Inject('ETHERS_PROVIDER') 
        private readonly provider: ethers.JsonRpcProvider
    ) {
        this.contract = new ethers.Contract(
            USDC_PROXY_ADDRESS,
            abi,
            this.provider
        );
    }
}