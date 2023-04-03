import { globalStateStore } from ".";
import { Transaction, TransactionType } from "./Transaction";

export default class TransactionPool {
    public pendingTransactions: Transaction[];

    constructor() {
        this.pendingTransactions = [];
    }

    getTotalFeePending(): number {
        return this.pendingTransactions.reduce((result, tx) => (result += tx.fee), 0);
    }

    addPendingTransaction(newTx: Transaction) {
        // only valid transactions included
        const senderAccount = globalStateStore.getAccountByAddress(newTx.sender);
        if (Transaction.verifyTransaction(newTx) && senderAccount && newTx.nonce === senderAccount.nonce) {
            this.pendingTransactions.push(newTx);
        } else {
            throw new Error("Invalid transaction");
        }
    }

    pickTransactions(feeLimit: number): Transaction[] {
        let pickedTransactions = [];
        let totalFee = 0;

        for (let i = 0; i < this.pendingTransactions.length; i++) {
            if (this.pendingTransactions[i].fee + totalFee <= feeLimit) {
                pickedTransactions.push(this.pendingTransactions[i]);
                totalFee += this.pendingTransactions[i].fee;
            } else {
                break;
            }
        }
        return pickedTransactions;
    }

    removeExecuted(txHashes: string[]): void {
        this.pendingTransactions = this.pendingTransactions.filter(tx => !txHashes.includes(tx.hash));
    }

    toJSON(): TransactionType[] {
        return this.pendingTransactions;
    }
}
