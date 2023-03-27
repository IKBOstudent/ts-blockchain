import Block from "./Block";
import TransactionPool from "./TransactionPool";

const TEMP__DIFFICULTY = 4;
const TEMP_SIGNATURE = '--';

export default class Blockchain {
    public chain: Block[];
    public transactionPool: TransactionPool;

    constructor() {
        this.chain = [Block.genesisBlock()];
        this.transactionPool = new TransactionPool();
    }

    getLastBlock(): Block {
        return this.chain[this.chain.length - 1];
    }

    addNewBlock(): Block {
        const parent = this.getLastBlock();
        const newBlock = new Block(
            parent.index + 1, 
            parent.hash.toString('hex'),
            this.transactionPool.pendingTransactions,
            TEMP__DIFFICULTY 
        )

        newBlock.mineBlock();
        this.transactionPool.pendingTransactions = [];
        this.chain.push(newBlock);
        return newBlock;
    }
}