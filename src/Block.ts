import * as crypto from 'crypto';
import MerkleTree from 'merkletreejs';
import Transaction from './Transaction';

export default class Block {
    // header
    public readonly index: number;
    public readonly timestamp: number;
    public readonly previousHash: string;
    public readonly minerAddress: string;

    public readonly transactions: Transaction[];
    public readonly transactionsMerkleTrie: MerkleTree;
    public readonly merkleRootHash: string;

    public readonly stateRootHash: string; // state trie root

    // PoW parameters
    public readonly difficulty: number;
    public nonce: number;
    public hash: Buffer;

    constructor(
        minerAddress: string,
        index: number,
        previousHash: string,
        transactions: Transaction[],
        difficulty: number,
        stateRootHash: string,
    ) {
        this.minerAddress = minerAddress;
        this.index = index;
        this.timestamp = Date.now();
        this.previousHash = previousHash;
        this.transactions = transactions;
        this.difficulty = difficulty;
        this.nonce = 0;

        this.hash = Buffer.from('0'.repeat(64), 'hex');

        this.transactionsMerkleTrie = new MerkleTree(this.transactions.map((tx) => tx.hash));
        this.merkleRootHash = this.transactionsMerkleTrie.getHexRoot();
        this.stateRootHash = stateRootHash;
    }

    static genesisBlock(): Block {
        // generates the first block in chain
        return new this('0'.repeat(64), 0, '', [], 0, '0'.repeat(64));
    }

    calculateHash(): Buffer {
        return crypto
            .createHash('sha3-256')
            .update(
                this.index + this.timestamp + this.previousHash + this.merkleRootHash + this.nonce,
            )
            .digest();
    }

    mineBlock(): void {
        // "000...00xxxxxxx" - PoW: hash starts with N=difficulty zeros;

        this.hash = this.calculateHash();
        let hashToBin = () =>
            this.hash.reduce((result, byte) => (result += byte.toString(2).padStart(8, '0')), '');

        while (!hashToBin().startsWith('0'.repeat(this.difficulty))) {
            this.nonce++;
            this.hash = this.calculateHash(); // rehash with new nonce
        }

        console.log('Block mined: ' + this.hash.toString('hex'));
    }

    toJSON() {
        return {
            index: this.index,
            timestamp: this.timestamp,
            miner: this.minerAddress,
            transations: this.transactions.map((tx) => tx.toJSON()),
            hash: `0x${this.hash}`,
            parentHash: `0x${this.previousHash}`,
            merkleRoot: `0x${this.merkleRootHash}`,
            stateRoot: `0x${this.stateRootHash}`,
            difficulty: this.difficulty,
            nonce: this.nonce,
        };
    }
}
