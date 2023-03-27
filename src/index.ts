import Account from "./Account";
import AccountStore from "./AccountStore";
import Blockchain from "./Blockchain";
import TransactionPool from "./TransactionPool";

const accountStore = new AccountStore();

const pers1 = new Account();
const pers2 = new Account();
accountStore.addAccount(pers1);

const pers1Address = pers1.address;
const pers2Address = pers2.address;

const tr1 = pers1.initiateTransaction(pers2Address, 20);
console.log(tr1.toString())
console.log(tr1.verifyTransaction())

const tr2 = pers1.initiateTransaction(pers2Address, 10);
console.log(tr2.toString())
console.log(tr2.verifyTransaction())

const tr3 = pers2.initiateTransaction(pers1Address, 30);
console.log(tr3.toString())
console.log(tr3.verifyTransaction())


const blockchain = new Blockchain();
console.log(blockchain.chain[0].toString());

blockchain.transactionPool.addPendingTransaction(tr1);
blockchain.transactionPool.addPendingTransaction(tr2);
blockchain.transactionPool.addPendingTransaction(tr3);

blockchain.addNewBlock()

console.log(blockchain.chain[1].toString());


