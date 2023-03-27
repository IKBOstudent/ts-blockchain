import * as crypto from "crypto";
import { ec } from "elliptic";
import Account from "./Account";

import { accountStore } from ".";

export default class Transaction {
    public sender: string;
    public receiver: string;
    public value: number;
    public fee: number;
    public nonce: number;

    // transaction hash
    public hash: Buffer;

    // signature by sender
    public signature: ec.Signature | null;

    // additional info
    public status: "PENDING" | "CONFIRMED" | "FAILED";
    public blockIndex: number;
    public blockHash: string;

    constructor(senderAddress: string, receiverAddress: string, value: number, fee: number, nonce: number) {
        this.sender = senderAddress;
        this.receiver = receiverAddress;
        this.value = value;
        this.fee = fee;
        this.nonce = nonce;
        this.hash = this.generateHash();
        this.signature = null;

        this.status = "PENDING";
        this.blockIndex = null;
        this.blockHash = "";
    }

    generateHash(): Buffer {
        return crypto
            .createHash("sha3-256")
            .update(this.sender + this.receiver + this.value + this.fee)
            .digest();
    }

    executeTransaction(blockIndex: number, blockHash: string) {
        this.blockIndex = blockIndex;
        this.blockHash = blockHash;

        const senderAccount = accountStore.getAccountByAddress(this.sender);
        const receiverAccount = accountStore.getAccountByAddress(this.receiver) || null;

        if (receiverAccount === null) {
            this.status = "FAILED";
            senderAccount.pendingTransactionCount--;
            throw new Error("Receiver address invalid");
        }

        if (senderAccount.balance < this.value + this.fee) {
            this.status = "FAILED";
            senderAccount.pendingTransactionCount--;
            throw new Error("Sender has insufficient funds");
        }

        if (senderAccount.sentTransactionCount + 1 !== this.nonce) {
            this.status = "FAILED";
            senderAccount.pendingTransactionCount--;
            throw new Error("Nonce is invalid");
        }

        senderAccount.balance -= this.value + this.fee;
        receiverAccount.balance += this.value;
        senderAccount.sentTransactionCount++;

        this.status = "CONFIRMED";
    }

    verifyTransaction(): boolean {
        if (this.signature === null || this.signature.recoveryParam === null) {
            return false;
        }

        // recovering publicKey with signature
        let recoveredPublicKey = new ec("secp256k1")
            .recoverPubKey(this.hash, this.signature, this.signature.recoveryParam)
            .encode("hex");

        // if address of sender === signature publicKey hash => signature is valid
        return Account.generateAddress(recoveredPublicKey) === this.sender;
    }

    static executeMiningRewardTransaction(minerAddress: string, reward: number) {
        const minerAccount = accountStore.getAccountByAddress(minerAddress);
        minerAccount.balance += reward;
    }

    toString(): string {
        return (
            `=================================\n` +
            `Transaction : 0x${this.hash.toString("hex")}\n` +
            `From        : 0x${this.sender}\n` +
            `To          : 0x${this.receiver}\n` +
            `Value       : ${this.value}\n` +
            `Fee         : ${this.fee}\n` +
            `Nonce       : ${this.nonce}\n` +
            `=================================`
        );
    }
}
