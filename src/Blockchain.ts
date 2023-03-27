import Account from "./Account";
import Block from "./Block";
import Transaction from "./Transaction";
import TransactionPool from "./TransactionPool";

const TEMP__DIFFICULTY = 4;
const BLOCK_FEE_LIMIT = 5;
const MINING_REWARD = 2;

export default class Blockchain {
    public miner: Account;
    public chain: Block[];
    public transactionPool: TransactionPool;

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
                tx.executeTransaction(minedBlock.index, minedBlock.hash.toString("hex"));

                console.log("Executed\n" + tx.toString());
            } catch (e) {
                console.log(`Transaction failed: ${e}\n`, tx.toString());
            }
            // miners receives fee anyway
            totalFees += tx.fee;
        }

        Transaction.executeMiningRewardTransaction(this.miner.address, totalFees + MINING_REWARD);
    }

    addNewBlock(): Block {
        const parent = this.getLastBlock();
        const newBlock = new Block(
            parent.index + 1,
            parent.hash.toString("hex"),
            this.transactionPool.pickTransactions(BLOCK_FEE_LIMIT),
            TEMP__DIFFICULTY
        );

        newBlock.mineBlock();
        this.chain.push(newBlock);
        console.log(newBlock.toString());

        this.executeTransactions(newBlock);

        this.transactionPool.removeConfirmed(newBlock.transactions.map(tx => tx.hash));

        return newBlock;
    }
}
