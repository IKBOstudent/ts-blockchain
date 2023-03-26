import SHA256 from 'crypto-js/sha256';

export default class Block {
    // header
    public index: number;
    public timestamp: number;
    public previousHash: string;

    // transactions list
    public transactions: Array<any>;

    // PoW parameters
    public difficulty: number;
    public nonce: number;

    // hash and sign
    public hash: string;
    public signature: string;

    constructor(
        index: number, 
        timestamp: number, 
        previousHash: string, 
        transactions: Array<any>, 
        difficulty: number,
        signature: string
    ) {
        this.index = index;
        this.timestamp = timestamp;
        this.previousHash = previousHash;
        this.transactions = transactions;
        this.difficulty = difficulty;
        this.nonce = 0;

        this.hash = "0".repeat(64);
        this.signature = signature;
    }

    static genesisBlock(): Block {
        // generates the first block in chain
        return new this(0, Date.now(), "", [], 0, "");
    }

    calculateHash(): string {
        return SHA256(
            this.index + 
            this.timestamp + 
            this.previousHash + 
            JSON.stringify(this.transactions) + 
            this.nonce
        ).toString()
    }

    mineBlock(): void {
        // "000...00xxxxxxx" - PoW: hash starts with N=difficulty zeros;

        this.hash = this.calculateHash();
        while (parseInt(this.hash, 16).toString(2).startsWith("0".repeat(this.difficulty))) {
            this.nonce++;
            this.hash = this.calculateHash(); // rehash with new nonce
        }

        console.log("Block mined: " + this.hash);
    }

    toString() {
        return `Block #${this.index}\n` +
            `Timestamp    : ${new Date(this.timestamp)}\n` + 
            `Transactions : ${this.transactions.length} transactions\n` +
            `Hash         : 0x${this.hash}\n` +
            `Parent Hash  : 0x${this.previousHash}\n` +
            `Difficulty   : ${this.difficulty}\n` +
            `Nonce        : ${this.nonce}\n` +
            `Signature    : ${this.signature}`;
    }
}