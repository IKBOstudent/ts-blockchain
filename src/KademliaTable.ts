import { Peer, HASH_LEN } from './Node';

export default class KademliaTable {
    bootNode: boolean;

    nodeID: Buffer;
    bucketSize: number;
    buckets: Peer[][];

    constructor(nodeID: string, size: number, bootNode = false) {
        this.bootNode = bootNode; // boot node stores all nodes

        this.nodeID = Buffer.from(nodeID, 'hex');
        this.bucketSize = size;
        this.buckets = [];

        // nodes are distributed in k-buckets of distances from 0 to HASH_LEN * 8 - 1
        for (let i = 0; i < HASH_LEN * 8; i++) {
            this.buckets.push([]);
        }
    }

    addNewNode(peer: Peer): { status: boolean; node?: Peer } {
        const newNodeID = Buffer.from(peer.nodeID, 'hex');

        const bucketIndex = KademliaTable.getBucketIndex(this.nodeID, newNodeID);
        const bucket = this.buckets[bucketIndex];

        let status = false;
        let node: Peer | undefined;
        if (bucket.length >= this.bucketSize && !this.bootNode) {
            status = true;
            node = bucket.pop();
            console.log(`bucket full. evicting ${node?.nodeID}`.bgMagenta);
        }

        bucket.push(peer);

        bucket.sort((a, b) =>
            Buffer.compare(
                KademliaTable.getXORdistance(this.nodeID, Buffer.from(a.nodeID, 'hex')),
                KademliaTable.getXORdistance(this.nodeID, Buffer.from(b.nodeID, 'hex')),
            ),
        );

        return { status, node };
    }

    removeNode(id: string): boolean {
        const nodeID = Buffer.from(id, 'hex');
        const bucketIndex = KademliaTable.getBucketIndex(this.nodeID, nodeID);
        const bucket = this.buckets[bucketIndex];
        if (bucket.length !== 0) {
            const index = bucket.findIndex((peer) => peer.nodeID === id);
            if (index >= 0) {
                bucket.splice(index, 1);
                return true;
            }
        }
        return false;
    }

    getClosestNodes(id: string, count: number): Peer[] {
        const nodeID = Buffer.from(id, 'hex');
        const nodes: Peer[] = [];
        for (let i = 0; i < HASH_LEN * 8; i++) {
            const bucket = this.buckets[i];

            bucket.forEach((peer) => {
                if (peer.nodeID !== id) {
                    nodes.push(peer);
                }
            });
        }

        return nodes
            .sort((a, b) =>
                Buffer.compare(
                    KademliaTable.getXORdistance(nodeID, Buffer.from(a.nodeID, 'hex')),
                    KademliaTable.getXORdistance(nodeID, Buffer.from(b.nodeID, 'hex')),
                ),
            )
            .slice(0, count);
    }

    static getXORdistance(hashA: Buffer, hashB: Buffer): Buffer {
        return hashA.map((val, i) => val ^ hashB[i]) as Buffer;
    }

    static getBucketIndex(hashA: Buffer, hashB: Buffer): number {
        for (let i = 0; i < HASH_LEN; i++) {
            const diff = hashA[i] ^ hashB[i];
            if (hashA !== hashB) {
                return i * 8 + Math.clz32(diff) - 24; // leading zeros of 32-bit - 24 bits
            }
        }

        // best case;
        return HASH_LEN * 8 - 1;
    }

    toJSON() {
        const nodes: Array<[number, Peer[]]> = [];
        for (let i = 0; i < HASH_LEN * 8; i++) {
            if (this.buckets[i].length > 0) {
                nodes.push([i, this.buckets[i]]);
            }
        }

        return nodes;
    }
}
