import * as crypto from 'crypto';
import MerkleTree from 'merkletreejs';
import { Transaction, TransactionType } from './Transaction';

export interface BlockType {
    index: number;
    timestamp?: number;
    previousHash: string;
    minerAddress: string;

    transactions: TransactionType[];
    transactionsRootHash?: string;
    stateRootHash: string;

    difficulty: number;
    hash?: string;
    nonce?: number;
}

export class Block implements BlockType {
    // header
    public readonly index: number;
    public readonly timestamp: number;
    public readonly previousHash: string;
    public readonly minerAddress: string;

    public readonly transactions: TransactionType[];
    public readonly transactionsRootHash: string;
    public readonly stateRootHash: string; // state trie root

    // PoW parameters
    public readonly difficulty: number;
    public hash?: string;
    public nonce: number;

    constructor(block: BlockType) {
        const {
            index,
            timestamp,
            previousHash,
            minerAddress,
            transactions,
            transactionsRootHash,
            stateRootHash,
            difficulty,
            hash,
            nonce,
        } = block;

        this.index = index;
        this.timestamp = timestamp || Date.now();
        this.previousHash = previousHash;
        this.minerAddress = minerAddress;

        this.transactions = transactions;
        if (transactionsRootHash) {
            this.transactionsRootHash = transactionsRootHash;
        } else {
            const transactionsMerkleTrie = new MerkleTree(this.transactions.map((tx) => tx.hash));
            this.transactionsRootHash = transactionsMerkleTrie.getRoot().toString('hex');
        }
        this.stateRootHash = stateRootHash;

        this.difficulty = difficulty;
        this.hash = hash;
        this.nonce = nonce || 0;
    }

    static genesisBlock(): Block {
        // generates the first block in chain
        const genesisBlock = {
            index: 0,
            previousHash: '',
            minerAddress: '',
            transactions: [],
            transactionsRootHash: '',
            stateRootHash: '',
            difficulty: 0,
            hash: '0'.repeat(64),
            nonce: 0,
        };
        return new this(genesisBlock);
    }

    calculateHash(): Buffer {
        return crypto
            .createHash('sha3-256')
            .update(
                this.index +
                    this.timestamp +
                    this.previousHash +
                    this.transactionsRootHash +
                    this.nonce,
            )
            .digest();
    }

    mineBlock(): void {
        // "000...00xxxxxxx" - PoW: hash starts with N=difficulty zeros;

        let hash = this.calculateHash();
        let hashToBin = (hash: Buffer) =>
            hash.reduce((result, byte) => (result += byte.toString(2).padStart(8, '0')), '');

        while (!hashToBin(hash).startsWith('0'.repeat(this.difficulty))) {
            this.nonce++;
            hash = this.calculateHash(); // rehash with new nonce
        }

        this.hash = hash.toString('hex');
        console.log('Block mined: ' + this.hash);
    }

    toJSON(): BlockType {
        return {
            index: this.index,
            timestamp: this.timestamp,
            previousHash: this.previousHash,
            minerAddress: this.minerAddress,

            transactions: this.transactions,
            transactionsRootHash: this.transactionsRootHash,
            stateRootHash: this.stateRootHash,

            difficulty: this.difficulty,
            hash: this.hash,
            nonce: this.nonce,
        };
    }
}
