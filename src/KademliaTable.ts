import * as crypto from 'crypto';
import { Peer } from './Node';

export default class KademliaTable {
    nodeID: Buffer;
    size: number;
    buckets: Peer[][];

    constructor(nodeID: Buffer, size: number) {
        this.nodeID = nodeID;
        this.size = size;
        this.buckets = [];

        // nodes are distributed in buckets of distances from 0 to 160
        for (let i = 0; i < 160; i++) {
            this.buckets.push([]);
        }
    }

    addNewNode(peer: Peer) {
        const newNodeID = Buffer.from(peer.hashID, 'hex');
        if (newNodeID === this.nodeID) {
            return;
        }

        const bucketIndex = KademliaTable.getBucketIndex(this.nodeID, newNodeID);
        const bucket = this.buckets[bucketIndex];

        if (bucket.length < this.size) {
            bucket.push(peer);
        } else {
            bucket.pop();
            bucket.push(peer);
        }

        bucket.sort((a, b) =>
            Buffer.compare(
                KademliaTable.getXORdistance(this.nodeID, Buffer.from(a.hashID, 'hex')),
                KademliaTable.getXORdistance(this.nodeID, Buffer.from(b.hashID, 'hex')),
            ),
        );
    }

    removeNode(id: string): boolean {
        const nodeID = Buffer.from(id, 'hex');
        const bucketIndex = KademliaTable.getBucketIndex(this.nodeID, nodeID);
        const bucket = this.buckets[bucketIndex];
        if (bucket.length !== 0) {
            const index = bucket.findIndex((peer) => peer.hashID === id);
            if (index >= 0) {
                bucket.splice(index, 1);
                return true;
            }
        }
        return false;
    }

    getClosestNodes(id: string): Peer[] {
        const nodeID = Buffer.from(id, 'hex');
        const nodes: Peer[] = [];
        for (let i = 0; i < 160; i++) {
            const bucket = this.buckets[i];

            bucket.forEach((peer) => {
                if (peer.hashID !== id) {
                    nodes.push(peer);
                }
            });
        }

        return nodes
            .sort((a, b) =>
                Buffer.compare(
                    KademliaTable.getXORdistance(nodeID, Buffer.from(a.hashID, 'hex')),
                    KademliaTable.getXORdistance(nodeID, Buffer.from(b.hashID, 'hex')),
                ),
            )
            .slice(0, this.size);
    }

    static getXORdistance(hashA: Buffer, hashB: Buffer): Buffer {
        return hashA.map((val, i) => val ^ hashB[i]) as Buffer;
    }

    static getBucketIndex(hashA: Buffer, hashB: Buffer): number {
        for (let i = 0; i < 20; i++) {
            const diff = hashA[i] ^ hashB[i];
            if (hashA !== hashB) {
                return i * 8 + Math.clz32(diff) - 24; // leading zeros of 32-bit - 24 bits
            }
        }

        // best case;
        return 160 - 1;
    }

    toJSON() {
        const nodes: Array<[number, string[]]> = [];
        for (let i = 0; i < 160 && nodes.length < this.size; i++) {
            if (this.buckets[i].length > 0) {
                nodes.push([i, this.buckets[i].map((peer) => peer.hashID)]);
            }
        }

        return nodes;
    }
}
