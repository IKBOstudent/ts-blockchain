import * as crypto from "crypto";
import { ec } from "elliptic";
import Transaction from "./Transaction";

const TEMP__INITIAL_BALANCE = 100;
const TEMP__TRANSACTION_FEE = 1;

const EC = new ec("secp256k1");

export default class Account {
    public readonly address: string; // 20 first bytes of hashed public key
    public balance: number;
    public sentTransactionCount: number;
    public pendingTransactionCount: number;

    private readonly publicKey: string;
    private readonly privateKey: string;

    constructor() {
        this.balance = TEMP__INITIAL_BALANCE;
        const keyPair = EC.genKeyPair();
        this.privateKey = keyPair.getPrivate("hex");
        this.publicKey = keyPair.getPublic("hex");

        this.address = Account.generateAddress(this.publicKey);
        this.sentTransactionCount = 0;
        this.pendingTransactionCount = 0;
    }

    static generateAddress(publicKey: string): string {
        return crypto.createHash("sha3-256").update(publicKey.slice(2)).digest("hex").slice(-40);
    }

    initiateTransaction(receiverAddress: string, value: number): Transaction {
        if (this.balance + TEMP__TRANSACTION_FEE < value) {
            throw new Error("Insufficitent funds");
        }

        if (this.address === receiverAddress) {
            throw new Error("Invalid receiver address");
        }

        const transaction = new Transaction(
            this.address,
            receiverAddress,
            value,
            TEMP__TRANSACTION_FEE,
            this.sentTransactionCount + this.pendingTransactionCount + 1
        );

        this.pendingTransactionCount++;

        transaction.signature = this.signTransaction(transaction.hash);

        return transaction;
    }

    signTransaction(transactionHash: Buffer): ec.Signature {
        return EC.sign(transactionHash, EC.keyFromPrivate(this.privateKey));
    }

    toString(): string {
        return (
            `=================================\n` +
            `Account       : 0x${this.address}\n` +
            // `Public Key    : 0x${this.publicKey}\n` +
            // `Private Key   : 0x${this.privateKey}\n` +
            `Balance       : ${this.balance}\n` +
            `Transactions  : ${this.sentTransactionCount}\n` +
            `=================================`
        );
    }
}
