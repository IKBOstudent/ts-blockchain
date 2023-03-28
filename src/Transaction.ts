import * as crypto from 'crypto';
import { ec } from 'elliptic';
import Account from './Account';
import { globalStateStore } from '.';

export default class Transaction {
    // input
    public readonly sender: string;
    public readonly receiver: string;
    public readonly value: number;
    public readonly fee: number;
    public readonly nonce: number;

    // transaction hash
    public hash: Buffer;

    // signature by sender
    public signature: ec.Signature | null;

    // additional info
    public status: 'PENDING' | 'CONFIRMED' | 'FAILED';
    public blockIndex: number;
    public blockHash: string;

    constructor(
        senderAddress: string,
        receiverAddress: string,
        value: number,
        fee: number,
        nonce: number,
    ) {
        this.sender = senderAddress;
        this.receiver = receiverAddress;
        this.value = value;
        this.fee = fee;
        this.nonce = nonce;
        this.hash = this.generateHash();
        this.signature = null;

        this.status = 'PENDING';
        this.blockIndex = null;
        this.blockHash = '';
    }

    generateHash(): Buffer {
        return crypto
            .createHash('sha3-256')
            .update(this.sender + this.receiver + this.value + this.fee)
            .digest();
    }

    verifyTransaction(): boolean {
        if (this.signature === null || this.signature.recoveryParam === null) {
            return false;
        }

        // recovering publicKey with signature
        let recoveredPublicKey = new ec('secp256k1')
            .recoverPubKey(this.hash, this.signature, this.signature.recoveryParam)
            .encode('hex');

        // if address of sender === signature publicKey hash => signature is valid
        return Account.generateAddress(recoveredPublicKey) === this.sender;
    }

    executeTransaction(blockIndex: number, blockHash: string) {
        this.blockIndex = blockIndex;
        this.blockHash = blockHash;

        const senderAccount = globalStateStore.getAccountByAddress(this.sender) || null;
        const receiverAccount = globalStateStore.getAccountByAddress(this.receiver) || null;

        let errorMessage = '';

        if (senderAccount === null) {
            errorMessage = 'Sender address invalid';
        } else if (receiverAccount === null) {
            errorMessage = 'Receiver address invalid';
        } else if (senderAccount.balance < this.value + this.fee) {
            errorMessage = 'Sender has insufficient funds';
        } else if (senderAccount.nonce !== this.nonce) {
            errorMessage = 'Nonce is invalid';
        }

        if (errorMessage) {
            this.status = 'FAILED';
            throw new Error(errorMessage);
        }

        senderAccount.balance -= this.value + this.fee;
        receiverAccount.balance += this.value;
        senderAccount.nonce++;

        this.status = 'CONFIRMED';
    }

    static executeMiningRewardTransaction(minerAddress: string, reward: number) {
        const minerAccount = globalStateStore.getAccountByAddress(minerAddress);
        minerAccount.balance += reward;
    }

    toJSON() {
        return {
            hash: `0x${this.hash.toString('hex')}`,
            status: this.status,
            from: `0x${this.sender}`,
            to: `0x${this.receiver}`,
            value: this.value,
            fee: this.fee,
            nonce: this.nonce,
            blockIndex: this.blockIndex,
            blockHash: `0x${this.blockHash}`,
        };
    }
}
