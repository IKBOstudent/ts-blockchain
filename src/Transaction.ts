import * as crypto from "crypto";
import { ec } from "elliptic";
import { globalStateStore } from ".";
import { generateAddress } from "./utils";

export interface TransactionType {
    sender: string;
    receiver: string;
    value: number;
    fee: number;
    nonce: number;
    hash?: string;
    signature?: string;
    recoveryParam?: number;

    status?: "PENDING" | "CONFIRMED" | "FAILED";
    blockIndex?: number;
    blockHash?: string;
}

export class Transaction implements TransactionType {
    // input
    public readonly sender: string;
    public readonly receiver: string;
    public readonly value: number;
    public readonly fee: number;
    public readonly nonce: number;

    // transaction hash
    public hash: string;
    public signature?: string;
    public recoveryParam?: number;

    public status: "PENDING" | "CONFIRMED" | "FAILED";
    public blockIndex?: number;
    public blockHash?: string;

    constructor(tx: TransactionType) {
        const { sender, receiver, value, fee, nonce, hash, signature, recoveryParam, status, blockIndex, blockHash } =
            tx;
        this.sender = sender;
        this.receiver = receiver;
        this.value = value;
        this.fee = fee;
        this.nonce = nonce;
        this.hash = hash || this.generateHash();
        this.signature = signature;
        this.recoveryParam = recoveryParam;
        this.status = status || "PENDING";
        this.blockIndex = blockIndex;
        this.blockHash = blockHash;
    }

    generateHash(): string {
        return crypto
            .createHash("sha3-256")
            .update(this.sender + this.receiver + this.value + this.fee)
            .digest("hex");
    }

    static verifyTransaction(tx: TransactionType): boolean {
        if (tx.signature === undefined || tx.hash === undefined || tx.recoveryParam === undefined) {
            console.log("can't verify");
            return false;
        }

        // recovering publicKey with signature
        let recoveredPublicKey = new ec("secp256k1")
            .recoverPubKey(Buffer.from(tx.hash, "hex"), Buffer.from(tx.signature, "hex"), tx.recoveryParam)
            .encode("hex");

        // if address of sender === signature publicKey hash => signature is valid
        return generateAddress(recoveredPublicKey) === tx.sender;
    }

    executeTransaction(blockIndex: number, blockHash: string) {
        this.blockIndex = blockIndex;
        this.blockHash = blockHash;

        const senderAccount = globalStateStore.getAccountByAddress(this.sender);
        const receiverAccount = globalStateStore.getAccountByAddress(this.receiver);

        if (!senderAccount) {
            this.status = "FAILED";
            throw new Error("Sender address invalid");
        }
        if (!receiverAccount) {
            this.status = "FAILED";
            throw new Error("Receiver address invalid");
        }
        if (senderAccount.balance < this.value + this.fee) {
            this.status = "FAILED";
            throw new Error("Sender has insufficient funds");
        }
        if (senderAccount.nonce !== this.nonce) {
            this.status = "FAILED";
            throw new Error("Nonce is invalid");
        }

        senderAccount.balance -= this.value + this.fee;
        receiverAccount.balance += this.value;
        senderAccount.nonce++;

        this.status = "CONFIRMED";
    }

    static executeMiningRewardTransaction(minerAddress: string, reward: number) {
        const minerAccount = globalStateStore.getAccountByAddress(minerAddress);
        if (minerAccount) {
            minerAccount.balance += reward;
        }
    }

    toJSON(): TransactionType {
        return JSON.parse(
            JSON.stringify({
                sender: this.sender,
                receiver: this.receiver,
                value: this.value,
                fee: this.fee,
                nonce: this.nonce,
                hash: this.hash,
                signature: this.signature,
                recoveryParam: this.recoveryParam,
                status: this.status,
                blockIndex: this.blockIndex,
                blockHash: this.blockHash,
            })
        );
    }
}
