import { parentPort } from 'worker_threads';
import * as crypto from 'crypto';

function worker_calculate_hash(
    index: number,
    timestamp: number,
    previousHash: string,
    transactionsRootHash: string,
    nonce: number,
) {
    return crypto
        .createHash('sha3-256')
        .update(index + timestamp + previousHash + transactionsRootHash + nonce)
        .digest();
}

function mineBlock(
    index: number,
    timestamp: number,
    previousHash: string,
    transactionsRootHash: string,
    difficulty: number,
) {
    // "000...00xxxxxxx" - PoW: hash starts with N=difficulty zeros in hex form
    console.time('mining');

    let nonce = 0;
    let hash = worker_calculate_hash(
        index,
        timestamp,
        previousHash,
        transactionsRootHash,
        nonce,
    ).toString('hex');

    while (!hash.startsWith('0'.repeat(difficulty))) {
        nonce++;
        hash = worker_calculate_hash(
            index,
            timestamp,
            previousHash,
            transactionsRootHash,
            nonce,
        ).toString('hex'); // rehash with new nonce
    }

    console.log('Block mined: ' + hash);
    console.timeEnd('mining');

    return { hash, nonce };
}

if (parentPort !== null) {
    parentPort.on('message', (message) => {
        const { index, timestamp, previousHash, transactionsRootHash, difficulty } = message.data;
        const { hash, nonce } = mineBlock(
            index,
            timestamp,
            previousHash,
            transactionsRootHash,
            difficulty,
        );
        parentPort?.postMessage({
            hash,
            nonce,
        });
    });
} else {
    console.log('parent port not defined');
}
