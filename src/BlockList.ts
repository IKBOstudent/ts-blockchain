import { Block } from './Block';

export class BlockNode {
    public blockData: Block;
    public nextHash: BlockNode | null;

    constructor(data: Block) {
        this.blockData = data;
        this.nextHash = null;
    }
}

export class BlockList {
    public root: BlockNode | null;
    public last: BlockNode | null;

    constructor() {
        this.root = null;
        this.last = null;
    }

    addBlockNode(data: Block) {
        if (this.root === null || this.last === null) {
            this.root = new BlockNode(data);
            this.last = new BlockNode(data);
        } else {
            const newNode = new BlockNode(data);
            this.last.nextHash = newNode;
            this.last = newNode;
        }
    }
}
