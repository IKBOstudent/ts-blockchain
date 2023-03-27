import * as crypto from "crypto";
import { ec } from "elliptic";
import Transaction from "./Transaction";

export default class Block {
    // header
    public index: number;
    public timestamp: number;
    public previousHash: string;

    // transactions list
    public transactions: Transaction[];

    // PoW parameters
    public difficulty: number;
    public nonce: number;

    // hash and sign
    public hash: Buffer;
    public merkleRootHash: string;

    constructor(index: number, previousHash: string, transactions: Transaction[], difficulty: number) {
        this.index = index;
        this.timestamp = Date.now();
        this.previousHash = previousHash;
        this.transactions = transactions;
        this.difficulty = difficulty;
        this.nonce = 0;

        this.hash = Buffer.from("0".repeat(64), "hex");
        this.merkleRootHash = this.calculateMerkleRoot();
    }

    static genesisBlock(): Block {
        // generates the first block in chain
        return new this(0, "", [], 0);
    }

    calculateMerkleRoot(): string {
        if (this.transactions.length === 0) {
            return "";
        }

        let transactionHashes: string[] = this.transactions.map(tx => tx.hash.toString("hex"));

        while (transactionHashes.length > 1) {
            if (transactionHashes.length % 2 !== 0) {
                transactionHashes.push(transactionHashes[transactionHashes.length - 1]);
            }

            // hash each pair of hashes:
            const nextHashes: string[] = [];
            for (let i = 0; i < transactionHashes.length; i += 2) {
                const combinedHash = transactionHashes[i] + transactionHashes[i + 1];
                nextHashes.push(crypto.createHash("sha3-256").update(combinedHash).digest("hex"));
            }
            transactionHashes = nextHashes;
        }

        // return merkle root hash
        return transactionHashes[0];
    }

    calculateHash(): Buffer {
        return crypto
            .createHash("sha3-256")
            .update(this.index + this.timestamp + this.previousHash + this.merkleRootHash + this.nonce)
            .digest();
    }

    mineBlock(): void {
        // "000...00xxxxxxx" - PoW: hash starts with N=difficulty zeros;

        this.hash = this.calculateHash();
        let hashToBin = () => this.hash.reduce((acc, byte) => (acc += byte.toString(2).padStart(8, "0")), "");
        while (!hashToBin().startsWith("0".repeat(this.difficulty))) {
            this.nonce++;
            this.hash = this.calculateHash(); // rehash with new nonce
        }

        console.log("Block mined: " + this.hash.toString("hex"));
    }

    toString() {
        return (
            `=================================\n` +
            `Block        : #${this.index}\n` +
            `Timestamp    : ${new Date(this.timestamp)}\n` +
            `Transactions : ${this.transactions.length} transactions\n` +
            `Hash         : 0x${this.hash.toString("hex")}\n` +
            `Merkle Root  : 0x${this.merkleRootHash}\n` +
            `Parent Hash  : 0x${this.previousHash}\n` +
            `Difficulty   : ${this.difficulty}\n` +
            `Nonce        : ${this.nonce}\n` +
            `=================================`
        );
    }
}
