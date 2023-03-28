import { globalStateStore } from '.';
import Account from './Account';
import Block from './Block';
import Transaction from './Transaction';
import TransactionPool from './TransactionPool';

const TEMP__DIFFICULTY = 8;
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
        let totalFees = 0;
        for (const tx of minedBlock.transactions) {
            try {
                tx.executeTransaction(minedBlock.index, minedBlock.hash.toString('hex'));
                console.log('Executed');
            } catch (e) {
                console.log(`Transaction failed: ${e}`);
            }
            console.log(tx.toJSON());
            // miner receives fee anyway
            totalFees += tx.fee;
        }

        Transaction.executeMiningRewardTransaction(this.miner.address, totalFees + MINING_REWARD);
    }

    addNewBlock(): void {
        const parent = this.getLastBlock();

        const newBlock = new Block(
            this.miner.address,
            parent.index + 1,
            parent.hash.toString('hex'),
            this.transactionPool.pickTransactions(BLOCK_FEE_LIMIT),
            TEMP__DIFFICULTY,
            globalStateStore.getMerkleRootHash(),
        );

        newBlock.mineBlock();
        this.chain.push(newBlock);

        console.log(newBlock.toJSON());

        this.executeTransactions(newBlock);
        this.transactionPool.removeConfirmed(newBlock.transactions.map((tx) => tx.hash));
    }

    addNewTransaction(newTransaction: Transaction) {
        try {
            this.transactionPool.addPendingTransaction(newTransaction);
            if (this.transactionPool.getTotalFeePending() >= BLOCK_FEE_LIMIT) {
                this.addNewBlock();
            }
        } catch (e) {
            console.log(`transaction rejected: ${e}`);
        }
    }
}
