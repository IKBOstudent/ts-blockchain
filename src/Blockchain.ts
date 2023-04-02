import { globalStateStore } from '.';
import { Block, BlockType } from './Block';
import { Transaction, TransactionType } from './Transaction';
import TransactionPool from './TransactionPool';
import { Account } from './Account';

const DIFFICULTY = 8;
const BLOCK_FEE_LIMIT = 4;
const MINING_REWARD = 10;

export default class Blockchain {
    public miner: Account;
    public chain: Block[];
    private transactionPool: TransactionPool;

    constructor(miner: Account) {
        this.miner = miner;
        this.chain = [Block.genesisBlock()];
        this.transactionPool = new TransactionPool();
    }

    getLastBlock(): Block {
        return this.chain[this.chain.length - 1];
    }

    executeTransactions(minedBlock: Block) {
        if (!minedBlock.hash) {
            return console.log('invalid block');
        }

        let totalFees = 0;
        for (const txForm of minedBlock.transactions) {
            const tx = new Transaction(txForm);
            console.log(tx.toJSON());
            try {
                tx.executeTransaction(minedBlock.index, minedBlock.hash);
                console.log('TX executed');
            } catch (e) {
                console.log(`TX failed: ${e}`);
            }

            totalFees += tx.fee;
        }

        Transaction.executeMiningRewardTransaction(this.miner.address, totalFees + MINING_REWARD);
    }

    addNewBlock(): BlockType {
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
        } as BlockType);

        newBlock.mineBlock();
        this.chain.push(newBlock);

        console.log(newBlock.toJSON());

        this.executeTransactions(newBlock);
        this.transactionPool.removeExecuted(newBlock.transactions.map((tx) => tx.hash || ''));

        return newBlock.toJSON();
    }

    addNewTransaction(newTransaction: Transaction) {
        try {
            this.transactionPool.addPendingTransaction(newTransaction);
        } catch (e) {
            console.log(`TX rejected: ${e}`);
        }
    }

    toJSON() {
        return {
            blockchain: this.chain.map((block) => block.toJSON()),
            pendingTransactions: this.transactionPool.pendingTransactions.map((tx) => tx.toJSON()),
        };
    }
}
