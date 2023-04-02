import * as net from 'net';
import * as crypto from 'crypto';
import { globalStateStore } from '.';
import { Account, AccountType } from './Account';
import Blockchain from './Blockchain';
import KademliaTable from './KademliaTable';
import { generateAddress, generatePublicPrivateKeys } from './utils';
import { Transaction, TransactionType } from './Transaction';
import { BlockType } from './Block';

const LOCALHOST = '127.0.0.1';
const BOOT_NODE_PORT = 3001;
const BUCKET_SIZE = 4;

export const HASH_LEN = 8;

enum MESSAGE_TYPE {
    HANDSHAKE = 'HANDSHAKE',
    RESPONSE_CLOSEST_NODES = 'RESPONSE_CLOSEST_NODES',
}

enum SUBSCRIPTION_TYPE {
    SUB_PING = 'SUB_PING',
    SUB_SYNC = 'SUB_SYNC',
    SUB_NEW_ACCOUNT = 'SUB_NEW_ACCOUNT',
    SUB_NEW_BLOCK = 'SUB_NEW_BLOCK',
    SUB_TRANSACTION = 'SUB_TRANSACTION',
}

export enum PUBLICATION_TYPE {
    PUB_PING = 'PUB_PING',
    PUB_SYNC = 'PUB_SYNC',
    PUB_NEW_ACCOUNT = 'PUB_NEW_ACCOUNT',
    PUB_NEW_BLOCK = 'PUB_NEW_BLOCK',
    PUB_TRANSACTION = 'PUB_TRANSACTION',
}

class Subscription {
    receivedHashes: string[];

    constructor() {
        this.receivedHashes = [];
    }

    addHash(hash: string) {
        if (this.receivedHashes.length >= 256) {
            this.receivedHashes = this.receivedHashes.slice(128, 256);
        }
        this.receivedHashes.push(hash);
    }

    hashHash(hash: string): boolean {
        return this.receivedHashes.includes(hash);
    }
}

class NodeBlockchainInfo {
    account: Account;
    blockchain: Blockchain;

    // account private info
    private readonly publicKey: string;
    private readonly privateKey: string;

    constructor() {
        const { privateKey, publicKey } = generatePublicPrivateKeys();
        this.privateKey = privateKey;
        this.publicKey = publicKey;

        this.account = new Account({ address: generateAddress(this.publicKey) });
        globalStateStore.addAccount(this.account);
        this.blockchain = new Blockchain(this.account);
    }

    initiateTransaction(to: string, value: number): TransactionType {
        const tx = this.account.initiateTransaction(to, value, this.account.nonce, this.privateKey);
        this.blockchain.addNewTransaction(tx);
        return tx.toJSON();
    }
}

export interface Peer {
    nodeID: string;
    port: number;
}

export default class Node {
    port: number;
    server: net.Server;
    nodeID: string;
    DHT: KademliaTable;
    peers: Map<string, { socket: net.Socket; peer: Peer }>;

    subscriptions: Map<SUBSCRIPTION_TYPE, Subscription>;

    info: NodeBlockchainInfo;

    constructor(port: number) {
        this.port = port;
        this.server = net.createServer();
        this.nodeID = crypto.randomBytes(HASH_LEN).toString('hex');

        this.DHT = new KademliaTable(this.nodeID, BUCKET_SIZE, this.port === BOOT_NODE_PORT);

        this.peers = new Map();
        this.subscriptions = new Map();

        Object.values(SUBSCRIPTION_TYPE).forEach((type) => {
            // every node is subscribed for all types of publications
            this.subscriptions.set(type, new Subscription());
        });

        this.info = new NodeBlockchainInfo();
    }

    initServer(): void {
        this.server.on('connection', (socket) => {
            console.log(
                `[node ${this.port} | server] established connection with port=${socket.remotePort}`
                    .yellow,
            );

            if (socket.remotePort) {
                this.handleConnection('server', socket);
            } else {
                console.log(`[node ${this.port} | server] connection invalid`.black.bgRed);
            }
        });

        this.server.listen({ port: this.port, host: LOCALHOST }, () => {
            console.log(`[node ${this.port} | server] server listening on port=${this.port}`);
            console.log(`           | id: ${this.nodeID}`);
        });
    }

    joinNetwork(): void {
        if (this.port !== BOOT_NODE_PORT) {
            console.log(`connecting to BOOT node in ${(this.port % 100) * 1000}ms`.dim);
            setTimeout(() => {
                this.connectToBOOTNode();
            }, (this.port % 100) * 1000);
        }
    }

    findPeerBySocket(socket: net.Socket): Peer | undefined {
        for (let value of this.peers.values()) {
            if (value.socket === socket) {
                return value.peer;
            }
        }
    }

    connectToBOOTNode(): void {
        const socket = net.createConnection({ port: BOOT_NODE_PORT });

        socket.on('connect', () => {
            console.log(
                `[node ${this.port} | client] established connection with port=${BOOT_NODE_PORT}`
                    .yellow,
            );

            const message = {
                content: {
                    nodeID: this.nodeID,
                    port: this.port,
                } as Peer,
            };

            this.sendData(socket, MESSAGE_TYPE.HANDSHAKE, message);
            this.handleConnection('client', socket);
        });

        socket.on('error', (err) => {
            console.log(`[node ${this.port} | client] BOOT node unavaliable ${err.name}`.red);
        });
    }

    connectToClosestNode(peer: Peer): void {
        console.log(`Trying to connect to port=${peer.port}...`);
        const socket = net.createConnection({ port: peer.port }, () => {
            console.log(
                `[node ${this.port} | client] established connection with port=${peer.port}`.yellow,
            );

            const message = {
                content: {
                    nodeID: this.nodeID,
                    port: this.port,
                } as Peer,
            };

            this.peers.set(peer.nodeID, { socket, peer });

            this.sendData(socket, MESSAGE_TYPE.HANDSHAKE, message);
            this.handleConnection('client', socket, peer);
        });
    }

    handleConnection(type: 'client' | 'server', socket: net.Socket, peer?: Peer): void {
        socket.on('data', (response) => {
            console.log(
                `[node ${this.port} | ${type}] received message from ${
                    peer ? `port=${peer.port}` : `UNKNOWN port=${socket.remotePort}`
                }`.cyan,
            );

            let data: { type: MESSAGE_TYPE | PUBLICATION_TYPE; message: string } = JSON.parse(
                response.toString(),
            );

            console.log('           | received type:', data.type);

            const msg: { hash: string; content: any } = JSON.parse(data.message);

            switch (data.type) {
                case MESSAGE_TYPE.HANDSHAKE:
                    const newPeer: Peer = msg.content;
                    process.stdout.write(
                        `adding new peer: ${newPeer.nodeID} | port=${newPeer.port}... `,
                    );

                    if (newPeer.nodeID === this.nodeID) {
                        return console.log('ID belongs to me'.red);
                    }

                    this.peers.set(newPeer.nodeID, { socket, peer: newPeer });
                    const evicted = this.DHT.addNewNode(newPeer);
                    console.log('added'.green);

                    if (evicted.status && evicted.node) {
                        process.stdout.write(`disconnecting with port=${evicted.node.port}... `);
                        const item = this.peers.get(evicted.node.nodeID);
                        if (item) {
                            item.socket.destroy();
                            this.peers.delete(evicted.node.nodeID);
                            console.log('disconnected'.green);
                        } else console.log('failed to disconnect'.red);
                    }

                    // if new node sent handshake
                    if (this.port === BOOT_NODE_PORT) {
                        console.log('sending closest nodes...');
                        this.sendData(socket, MESSAGE_TYPE.RESPONSE_CLOSEST_NODES, {
                            content: this.DHT.getClosestNodes(newPeer.nodeID, BUCKET_SIZE),
                        });
                    } else {
                        //
                    }
                    break;

                case MESSAGE_TYPE.RESPONSE_CLOSEST_NODES:
                    const nodes: Peer[] = msg.content;
                    console.log(`connecting to discovered ${nodes.length} nodes...`);

                    if (nodes.length > BUCKET_SIZE) {
                        return console.log('invalid nodes'.red);
                    }

                    nodes.forEach((peer) => {
                        this.DHT.addNewNode(peer); // can't return evicted here
                        this.connectToClosestNode(peer);
                    });

                    console.log('nodes added'.green);

                    // publishing new account
                    setTimeout(
                        () =>
                            this.publish(
                                PUBLICATION_TYPE.PUB_NEW_ACCOUNT,
                                this.info.account.toJSON(),
                            ),
                        1000,
                    );
                    break;

                case PUBLICATION_TYPE.PUB_PING:
                case PUBLICATION_TYPE.PUB_SYNC:
                case PUBLICATION_TYPE.PUB_NEW_ACCOUNT:
                case PUBLICATION_TYPE.PUB_NEW_BLOCK:
                case PUBLICATION_TYPE.PUB_TRANSACTION:
                    const subType = `SUB${data.type.slice(3)}` as SUBSCRIPTION_TYPE;
                    const sub = this.subscriptions.get(subType);

                    if (sub?.receivedHashes.includes(msg.hash)) {
                        return console.log(`already received this ${data.type}`.dim);
                    }
                    sub?.addHash(msg.hash);
                    const content = msg.content;
                    console.log(content);

                    switch (data.type) {
                        case PUBLICATION_TYPE.PUB_NEW_ACCOUNT:
                            const newAccount = new Account(content);
                            globalStateStore.addAccount(newAccount);

                            break;

                        case PUBLICATION_TYPE.PUB_TRANSACTION:
                            const tx = new Transaction(content);
                            console.log(
                                tx.verifyTransaction() ? 'VALID TX'.green : 'INVALID TX'.red,
                            );
                            this.info.blockchain.addNewTransaction(tx);
                            break;

                        case PUBLICATION_TYPE.PUB_SYNC:
                            console.log('received state..... TBD');
                            break;

                        case PUBLICATION_TYPE.PUB_NEW_BLOCK:
                            console.log('received new block.... TBD');
                            break;
                    }

                    // propagate further
                    for (const val of this.peers.values()) {
                        if (val.socket !== socket) {
                            this.sendData(val.socket, data.type, msg);
                        }
                    }

                    break;

                default:
                    console.warn('Invalid message type');
            }
        });

        socket.on('error', (err) => {
            console.log(
                `[node ${this.port} | ${type}] connection failed ${err.name}: ${err.message}`.red,
            );
        });

        socket.on('close', () => {
            if (peer) {
                process.stdout.write(`removing ${peer.nodeID} on port=${peer.port}... `);
                console.log(this.DHT.removeNode(peer.nodeID) ? 'removed'.green : 'not removed'.red);
                this.peers.delete(peer.nodeID);
            }

            console.log(
                `[node ${this.port} | ${type}] connection closed with port=${socket.remotePort}`,
            );
        });
    }

    sendData(
        socket: net.Socket,
        type: MESSAGE_TYPE | PUBLICATION_TYPE,
        message: { hash?: string; content: any },
    ) {
        let data = {
            type: type,
            message: JSON.stringify(message),
        };

        socket.write(JSON.stringify(data));

        const peer = this.findPeerBySocket(socket);
        console.log(
            `[node ${this.port} | client] sent ${type} to ${
                peer ? `port=${peer.port}` : `UNKNOWN port=${socket.remotePort}`
            }`.black.bgCyan,
        );
    }

    publish(type: PUBLICATION_TYPE, content: any) {
        const data = {
            hash: crypto.randomBytes(8).toString('hex'),
            content,
        };

        console.log(`broadcasting ${type} with hash ${data.hash} to ${this.peers.size} peers`);

        const subType = `SUB${type.slice(3)}` as SUBSCRIPTION_TYPE;
        this.subscriptions.get(subType)?.addHash(data.hash); // to not receive own publication

        for (const val of this.peers.values()) {
            this.sendData(val.socket, type, data);
        }
    }

    makeTransaction(to: string, amount: string) {
        const tx = this.info.initiateTransaction(to, parseInt(amount));
        this.publish(PUBLICATION_TYPE.PUB_TRANSACTION, tx);
    }

    mineBlock() {
        try {
            const newBlock: BlockType = this.info.blockchain.addNewBlock();
            this.publish(PUBLICATION_TYPE.PUB_NEW_BLOCK, newBlock);
        } catch (e) {
            console.log(`Mining rejected: ${e}`);
        }
    }

    printPool() {
        console.log(this.info.blockchain.toJSON());
    }

    printConnections() {
        let count = 0;
        this.DHT.toJSON().forEach((val) => {
            count += val[1].length;
            process.stdout.write(
                `  ${String(val[0]).padStart(2, '0')}:  ${val[1][0].nodeID} | port:${
                    val[1][0].port
                }\n`.inverse,
            );
            val[1]
                .slice(1)
                .forEach((peer, i) =>
                    console.log(`       ${peer.nodeID} | port:${peer.port}`.inverse),
                );
        });
        if (count === 0) {
            console.log('no connections'.inverse);
        }
        if (count !== this.peers.size) {
            console.log(`ERROR: have ${this.peers.size - count} not removed peers`.bgRed);
        }
    }

    printID() {
        console.log(`node ID: ${this.nodeID}`);
        console.log(`account ID: ${this.info.account.address}`);
    }
}
