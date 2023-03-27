import Account from "./Account";
import AccountStore from "./AccountStore";
import Blockchain from "./Blockchain";
import TransactionPool from "./TransactionPool";

export const accountStore = new AccountStore();

const pers1 = new Account();
const pers2 = new Account();
const pers3_miner = new Account();
accountStore.addAccount(pers1);
accountStore.addAccount(pers2);
accountStore.addAccount(pers3_miner);

console.log(pers1.toString());
console.log(pers2.toString());
console.log(pers3_miner.toString());

const blockchain = new Blockchain(pers3_miner);

for (let i = 1; i < 4; i++) {
    const tr1 = pers1.initiateTransaction(pers2.address, 10);
    blockchain.transactionPool.addPendingTransaction(tr1);
    const tr2 = pers2.initiateTransaction(pers1.address, 10);
    blockchain.transactionPool.addPendingTransaction(tr2);
}

console.log(blockchain.transactionPool.toString());

blockchain.addNewBlock();

console.log(blockchain.transactionPool.toString());

console.log(pers1.toString());
console.log(pers2.toString());
console.log(pers3_miner.toString());

blockchain.addNewBlock();

console.log(blockchain.transactionPool.toString());

console.log(pers1.toString());
console.log(pers2.toString());
console.log(pers3_miner.toString());

blockchain.addNewBlock();

console.log(blockchain.transactionPool.toString());

console.log(pers1.toString());
console.log(pers2.toString());
console.log(pers3_miner.toString());
