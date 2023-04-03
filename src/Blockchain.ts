import { globalStateStore } from ".";
import { Block, BlockType } from "./Block";
import { Transaction, TransactionType } from "./Transaction";
import TransactionPool from "./TransactionPool";
import { Account } from "./Account";

const DIFFICULTY = 4;
const BLOCK_FEE_LIMIT = 4;
const MINING_REWARD = 10;

export default class Blockchain {
    public miner: Account;
    public chain: Block[];
    public transactionPool: TransactionPool;

    constructor(miner: Account) {
        this.miner = miner;
        this.chain = [Block.genesisBlock(miner.address)];
        this.transactionPool = new TransactionPool();
    }

    getLastBlock(): Block {
        return this.chain[this.chain.length - 1];
    }

    static executeTransactions(block: Block) {
        if (!block.hash) {
            return console.log("invalid block");
        }

        let totalFees = 0;
        for (const tx of block.transactions) {
            console.log(tx.toJSON());
            try {
                tx.executeTransaction(block.index, block.hash);
                console.log("TX executed".green);
            } catch (e) {
                console.log(`TX failed: ${e}`.red);
            }

            totalFees += tx.fee;
        }

        Transaction.executeMiningRewardTransaction(block.minerAddress, totalFees + MINING_REWARD);
    }

    addNewBlock(): BlockType {
        if (this.transactionPool.pendingTransactions.length === 0) {
            throw new Error("Too few txs to start mining");
        }
        const parent = this.getLastBlock();

        const newBlock = new Block({
            index: parent.index + 1,
            previousHash: parent.hash || "",
            minerAddress: this.miner.address,
            transactions: this.transactionPool.pickTransactions(BLOCK_FEE_LIMIT),
            stateRootHash: globalStateStore.getMerkleRootHash(),
            difficulty: DIFFICULTY,
        } as BlockType);

        Blockchain.executeTransactions(newBlock);
        this.transactionPool.removeExecuted(newBlock.transactions.map(tx => tx.hash || ""));

        newBlock.mineBlock();
        this.chain.push(newBlock);

        console.log(newBlock.toJSON());

        return newBlock.toJSON();
    }

    static verifyBlock(block: BlockType, prevBlock: Block): boolean {
        if (!block.hash || block.previousHash !== prevBlock.hash) {
            console.log("BLOCK INVALID: E1");
            return false;
        }
        if (
            Block.calculateHash(block).toString("hex") !== block.hash ||
            !block.hash.startsWith("0".repeat(DIFFICULTY))
        ) {
            console.log("BLOCK INVALID: E2");
            return false;
        }
        if (!block.timestamp || block.timestamp <= prevBlock.timestamp) {
            console.log("BLOCK INVALID: E3");
            return false;
        }
        for (const tx of block.transactions) {
            if (!Transaction.verifyTransaction(tx)) {
                console.log("BLOCK INVALID: E4");
                return false;
            }
        }

        return true;
    }

    addReceivedBlock(receivedBlock: BlockType) {
        if (Blockchain.verifyBlock(receivedBlock, this.getLastBlock())) {
            const block = new Block(receivedBlock);
            this.chain.push(block);
            Blockchain.executeTransactions(block);
            this.transactionPool.removeExecuted(block.transactions.map(tx => tx.hash || ""));
        } else {
            return console.log("invalid block");
        }
    }

    syncBlockchain(blockchain: BlockType[]) {
        if (blockchain.length === 0 || blockchain[0].hash !== "0".repeat(64) || blockchain[0].index !== 0) {
            throw new Error("BLOCKCHAIN INVALID: E1");
        }
        const genesis = new Block(blockchain.shift() as BlockType);
        const validChain = [genesis];
        for (const blockForm of blockchain) {
            const block = new Block(blockForm);
            if (!Blockchain.verifyBlock(block, validChain[validChain.length - 1])) {
                throw new Error("BLOCKCHAIN INVALID: E2");
            }
            validChain.push(block);
        }
        // if valid then accept
        this.chain = validChain;
    }

    addNewTransaction(newTransaction: Transaction) {
        try {
            this.transactionPool.addPendingTransaction(newTransaction);
        } catch (e) {
            console.log(`TX rejected: ${e}`);
        }
    }

    toJSON() {
        return this.chain.map(block => block.toJSON());
    }
}
