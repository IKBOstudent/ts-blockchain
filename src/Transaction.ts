import * as crypto from 'crypto';
import { ec } from 'elliptic';
import Account from './Account';

export default class Transaction {
    public sender: string;
    public receiver: string;
    public value: number;
    public fee: number;
    public hash: Buffer;
    public signature: ec.Signature | null;

    constructor(senderAddress: string, receiverAddress: string, value: number, fee: number) {
        this.sender = senderAddress;
        this.receiver = receiverAddress;
        this.value = value;
        this.fee = fee;
        this.hash = this.generateHash();
        this.signature = null;
    }

    generateHash(): Buffer {
        return crypto.createHash('sha3-256').update(
            this.sender +
            this.receiver +
            this.value +
            this.fee
        ).digest()
    }

    executeTransaction() {
        
    }

    verifyTransaction(): boolean {
        if (this.signature === null || this.signature.recoveryParam === null) {
            return false;
        }

        // recovering publicKey with signature
        let recoveredPublicKey = new ec('secp256k1').recoverPubKey(
            this.hash, 
            this.signature, 
            this.signature.recoveryParam
        ).encode('hex');

        // if address of sender and signature publicKey hash match => signature is valid
        return Account.generateAddress(recoveredPublicKey) === this.sender;
    }

    toString(): string {
        return `=================================\n` +
            `Transaction : 0x${this.hash.toString('hex')}\n` + 
            `From        : 0x${this.sender}\n` + 
            `To          : 0x${this.receiver}\n` +
            `Value       : ${this.value}\n` + 
            `Fee         : ${this.fee}\n` +
            `=================================`
    }

}