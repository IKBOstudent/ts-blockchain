import Account from "./Account";

const pers1 = new Account();
console.log(pers1.toString())

const pers2 = new Account();
console.log(pers2.toString())

const tr1 = pers1.initiateTransaction(pers2.address, 20);
console.log(tr1.toString())

console.log(tr1.verifyTransaction())

const tr2 = pers1.initiateTransaction(pers2.address, 10);
console.log(tr2.toString())

console.log(tr2.verifyTransaction())

const tr3 = pers2.initiateTransaction(pers1.address, 30);
console.log(tr3.toString())

console.log(tr3.verifyTransaction())
