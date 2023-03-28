import { globalStateStore } from '.';
import Transaction from './Transaction';

export default class TransactionPool {
    public pendingTransactions: Transaction[];

    constructor() {
        this.pendingTransactions = [];
    }

    getTotalFeePending(): number {
        return this.pendingTransactions.reduce((result, tx) => (result += tx.fee), 0);
    }

    addPendingTransaction(newTransaction: Transaction) {
        // only valid transactions included
        if (newTransaction.verifyTransaction()) {
            this.pendingTransactions.push(newTransaction);
        } else {
            throw new Error('Invalid transaction');
        }
    }

    pickTransactions(feeLimit: number): Transaction[] {
        let pickedTransactions = [];
        let totalFee = 0;

        for (let i = 0; i < this.pendingTransactions.length; i++) {
            const enoughMoney = this.pendingTransactions[i].fee + totalFee <= feeLimit;
            const validNonce =
                this.pendingTransactions[i].nonce ===
                globalStateStore.getAccountByAddress(this.pendingTransactions[i].sender).nonce;

            if (enoughMoney && validNonce) {
                pickedTransactions.push(this.pendingTransactions[i]);
                totalFee += this.pendingTransactions[i].fee;
            } else {
                break;
            }
        }
        return pickedTransactions;
    }

    removeConfirmed(txHashes: Buffer[]): void {
        this.pendingTransactions = this.pendingTransactions.filter(
            (tx) => !txHashes.includes(tx.hash),
        );
    }

    toJSON() {
        return {
            pendingTransactions: this.pendingTransactions.map((tx) => tx.toJSON()),
        };
    }
}
