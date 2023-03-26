import Block from "./Block";

const TEMP__DIFFICULTY = 4;
const TEMP_SIGNATURE = '--';

export default class Blockchain {
    public chain: Block[];

    constructor() {
        this.chain = [Block.genesisBlock()];
    }

    getLastBlock(): Block {
        return this.chain[this.chain.length - 1];
    }

    addBlock(transactions: Array<any>): Block {
        const lastBlock = this.getLastBlock();
        const newBlock = new Block(
            lastBlock.index,
            Date.now(),
            lastBlock.hash,
            transactions,
            TEMP__DIFFICULTY,
            TEMP_SIGNATURE
        );

        newBlock.mineBlock();
        return newBlock;
    }
}