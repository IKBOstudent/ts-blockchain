import { globalStateStore } from '.';
import { Block, BlockType } from './Block';
import { Transaction, TransactionType } from './Transaction';
import TransactionPool from './TransactionPool';
import { Account } from './Account';
import path from 'path';
import { Worker } from 'worker_threads';

const DIFFICULTY = 5; // > 7 WILL KILL YOUR CPU :)
const BLOCK_FEE_LIMIT = 4;
const MINING_REWARD = 10;

export default class Blockchain {
    public miner: Account;
    public chain: Block[];
    public transactionPool: TransactionPool;
    private miningWorker: Worker | null;

    constructor(miner: Account) {
        this.miner = miner;
        this.chain = [Block.genesisBlock(miner.address)];
        this.transactionPool = new TransactionPool();
        this.miningWorker = null;
    }

    getLastBlock(): Block {
        return this.chain[this.chain.length - 1];
    }

    static executeTransactions(block: Block) {
        if (!block.hash) {
            return console.log('invalid block');
        }

        let totalFees = 0;
        for (const tx of block.transactions) {
            console.log(tx.toJSON());
            try {
                tx.executeTransaction(block.index, block.hash);
                console.log('TX executed'.green);
            } catch (e) {
                console.log(`TX failed: ${e}`.red);
            }

            totalFees += tx.fee;
        }

        Transaction.executeMiningRewardTransaction(block.minerAddress, totalFees + MINING_REWARD);
    }

    addNewBlock(): Promise<BlockType> {
        return new Promise((resolve, reject) => {
            if (this.transactionPool.pendingTransactions.length === 0) {
                throw new Error('Too few txs to start mining');
            }
            const parent = this.getLastBlock();

            const newBlock = new Block({
                index: parent.index + 1,
                previousHash: parent.hash || '',
                minerAddress: this.miner.address,
                transactions: this.transactionPool.pickTransactions(BLOCK_FEE_LIMIT),
                stateRootHash: globalStateStore.getMerkleRootHash(),
                difficulty: DIFFICULTY,
            });

            this.miningWorker = new Worker(path.resolve(__dirname, 'mine_script.import.js'));

            this.miningWorker.postMessage({ data: newBlock.toJSON() });

            this.miningWorker.on('message', (msg: { hash: string; nonce: number }) => {
                newBlock.hash = msg.hash;
                newBlock.nonce = msg.nonce;
                Blockchain.executeTransactions(newBlock);
                this.transactionPool.removeExecuted(newBlock.transactions.map((tx) => tx.hash));
                this.chain.push(newBlock);
                this.miningWorker = null;
                resolve(newBlock.toJSON());
            });

            this.miningWorker.on('error', (e) => {
                reject(e);
                this.miningWorker = null;
            });

            this.miningWorker.on('exit', (code) => {
                this.miningWorker = null;
                if (code !== 0) reject(new Error(`Worker closed with exit code ${code}`));
            });
        });
    }

    static verifyBlock(block: Block, prevBlock: Block): boolean {
        if (!block.hash || block.previousHash !== prevBlock.hash) {
            console.log('BLOCK INVALID: E1');
            return false;
        }
        if (
            Block.calculateHash(block).toString('hex') !== block.hash ||
            !block.hash.startsWith('0'.repeat(DIFFICULTY))
        ) {
            console.log('BLOCK INVALID: E2');
            return false;
        }
        if (!block.timestamp || block.timestamp <= prevBlock.timestamp) {
            console.log('BLOCK INVALID: E3');
            return false;
        }
        for (const tx of block.transactions) {
            if (!Transaction.verifyTransaction(tx)) {
                console.log('BLOCK INVALID: E4');
                return false;
            }
        }

        return true;
    }

    addReceivedBlock(block: Block) {
        if (Blockchain.verifyBlock(block, this.getLastBlock())) {
            // kill current mining process
            if (this.miningWorker !== null) {
                this.miningWorker.terminate();
                console.log('MINING TERMINATED'.bgRed);
            }

            Blockchain.executeTransactions(block);
            this.transactionPool.removeExecuted(block.transactions.map((tx) => tx.hash));
            this.chain.push(block);
        } else {
            return console.log('invalid block');
        }
    }

    syncBlockchain(blockchain: BlockType[]) {
        if (
            blockchain.length === 0 ||
            blockchain[0].hash !== '0'.repeat(64) ||
            blockchain[0].index !== 0
        ) {
            throw new Error('BLOCKCHAIN INVALID: E1');
        }

        const genesisBlock = blockchain.shift();

        const validChain = [
            genesisBlock ? new Block(genesisBlock) : Block.genesisBlock(this.miner.address),
        ];

        for (const blockForm of blockchain) {
            const block = new Block(blockForm);
            if (!Blockchain.verifyBlock(block, validChain[validChain.length - 1])) {
                throw new Error('BLOCKCHAIN INVALID: E2');
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
        return this.chain.map((block) => block.toJSON());
    }
}
