import * as crypto from 'crypto';
import MerkleTree from 'merkletreejs';
import { Transaction, TransactionType } from './Transaction';

export interface BlockType {
    index: number;
    timestamp: number;
    previousHash: string;
    minerAddress: string;

    transactions: TransactionType[];
    transactionsRootHash: string;
    stateRootHash: string;

    difficulty: number;
    hash: string;
    nonce: number;
}

export class Block {
    // header
    public readonly index: number;
    public readonly timestamp: number;
    public readonly previousHash: string;
    public readonly minerAddress: string;

    public readonly transactions: Transaction[];
    public readonly transactionsRootHash: string;
    public readonly stateRootHash: string; // state trie root

    // PoW parameters
    public readonly difficulty: number;
    public hash: string;
    public nonce: number;

    constructor({
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
    }: {
        index: number;
        timestamp?: number;
        previousHash: string;
        minerAddress: string;
        transactions: Transaction[] | TransactionType[];
        transactionsRootHash?: string;
        stateRootHash: string;
        difficulty: number;
        hash?: string;
        nonce?: number;
    }) {
        this.index = index;
        this.timestamp = timestamp || Date.now();
        this.previousHash = previousHash;
        this.minerAddress = minerAddress;

        this.transactions = transactions.map((tx) => {
            if (tx instanceof Transaction) {
                return tx;
            } else {
                return new Transaction(tx);
            }
        });

        if (transactionsRootHash) {
            this.transactionsRootHash = transactionsRootHash;
        } else {
            const transactionsMerkleTrie = new MerkleTree(this.transactions.map((tx) => tx.hash));
            this.transactionsRootHash = transactionsMerkleTrie.getRoot().toString('hex');
        }
        this.stateRootHash = stateRootHash;

        this.difficulty = difficulty;
        this.hash = hash || '';
        this.nonce = nonce || 0;
    }

    static genesisBlock(miner: string): Block {
        // generates the first block in chain
        const genesisBlock = {
            index: 0,
            previousHash: '',
            minerAddress: miner,
            transactions: [],
            transactionsRootHash: '',
            stateRootHash: '',
            difficulty: 0,
            hash: '0'.repeat(64),
            nonce: 0,
        };
        return new this(genesisBlock);
    }

    static calculateHash(block: BlockType): Buffer {
        return crypto
            .createHash('sha3-256')
            .update(
                block.index +
                    block.timestamp +
                    block.previousHash +
                    block.transactionsRootHash +
                    block.nonce,
            )
            .digest();
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
