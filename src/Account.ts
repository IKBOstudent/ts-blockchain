import { Transaction } from "./Transaction";
import { signTransaction } from "./utils";

const TEMP__INITIAL_BALANCE = 100;
const TEMP__TRANSACTION_FEE = 1;

export interface AccountType {
    address: string;
    balance?: number;
    nonce?: number;
}

export class Account implements AccountType {
    public readonly address: string; // 20 first bytes of hashed public key
    public balance: number;
    public nonce: number; // amount of transactions confirmed

    constructor(account: AccountType) {
        const { address, balance = 100, nonce = 0 } = account;
        this.address = address;
        this.balance = balance;
        this.nonce = nonce;
    }

    initiateTransaction(receiver: string, value: number, nonce: number, privateKey: string): Transaction {
        const transaction = new Transaction({
            sender: this.address,
            receiver,
            value,
            fee: TEMP__TRANSACTION_FEE,
            nonce,
        });
        const { signature, recoveryParam } = signTransaction(transaction.hash, privateKey);
        transaction.signature = signature;
        transaction.recoveryParam = recoveryParam;
        return transaction;
    }

    toJSON(): AccountType {
        return {
            address: this.address,
            balance: this.balance,
            nonce: this.nonce,
        };
    }
}
