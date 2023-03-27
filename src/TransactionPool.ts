import Transaction from "./Transaction";


export default class TransactionPool {
    public pendingTransactions: Transaction[];

    constructor() {
        this.pendingTransactions = [];
    }

    addPendingTransaction(newTransaction: Transaction) {
        // only valid transactions included
        if (newTransaction.verifyTransaction()) {
            this.pendingTransactions.push(newTransaction);
        } else {
            throw new Error("Invalid transaction");
        }
    }



}