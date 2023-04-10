import * as net from 'net';
import * as crypto from 'crypto';
import { globalStateStore } from '.';
import { Account, AccountType } from './Account';
import Blockchain from './Blockchain';
import KademliaTable from './KademliaTable';
import { generateAddress, generatePublicPrivateKeys } from './utils';
import { Transaction, TransactionType } from './Transaction';
import { Block, BlockType } from './Block';
import StateStore from './StateStore';

const LOCALHOST = '127.0.0.1';
const BOOT_NODE_PORT = 3001;
const BUCKET_SIZE = 4;

export const HASH_LEN = 8;

enum MESSAGE_TYPE {
    HANDSHAKE = 'HANDSHAKE',
    RESPONSE_BOOT_INFO = 'RESPONSE_BOOT_INFO',
}

enum SUBSCRIPTION_TYPE {
    SUB_PING = 'SUB_PING',
    SUB_NEW_ACCOUNT = 'SUB_NEW_ACCOUNT',
    SUB_NEW_BLOCK = 'SUB_NEW_BLOCK',
    SUB_TRANSACTION = 'SUB_TRANSACTION',
}

export enum PUBLICATION_TYPE {
    PUB_PING = 'PUB_PING',
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
    bootSocket?: net.Socket;

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
        const serverStart: Promise<void> = new Promise((resolve, reject) => {
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
                resolve();
            });
        });

        serverStart
            .then(() => {
                this.joinNetwork();
            })
            .catch(() => console.log(`[node ${this.port} | server] server failed to start`));
    }

    joinNetwork(): void {
        if (this.port !== BOOT_NODE_PORT) {
            const timeout = (this.port % 100) * 1000;

            console.log(`connecting to BOOT node in ${timeout}ms`.dim);
            setTimeout(() => {
                this.connectToBOOTNode();
            }, timeout);
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

    connectToClosestNode(peer: Peer): Promise<void> {
        return new Promise((resolve, reject) => {
            console.log(`Trying to connect to port=${peer.port}...`);
            const socket = net.createConnection({ port: peer.port }, () => {
                console.log(
                    `[node ${this.port} | client] established connection with port=${peer.port}`
                        .yellow,
                );

                const message = {
                    content: {
                        nodeID: this.nodeID,
                        port: this.port,
                    } as Peer,
                };

                this.peers.set(peer.nodeID, { socket, peer });

                this.sendData(socket, MESSAGE_TYPE.HANDSHAKE, message, peer);
                this.handleConnection('client', socket);
                resolve();
            });

            socket.on('error', (err) => {
                console.log(`[node ${this.port} | client] node unavaliable ${err.name}`.red);
                reject(`port=${peer.port}`);
            });
        });
    }

    handleConnection(type: 'client' | 'server', socket: net.Socket): void {
        socket.on('data', (response) => {
            const peer = Array.from(this.peers.values()).find((val) => val.socket === socket)?.peer;
            console.log(
                `[node ${this.port} | ${type}] received message from ${
                    peer ? `port=${peer.port}` : `UNKNOWN port=${socket.remotePort}`
                }`.cyan,
            );
            // console.log('res', response.toString());
            let data: { type: MESSAGE_TYPE | PUBLICATION_TYPE; message: string } = JSON.parse(
                response.toString(),
            );

            console.log('           | received type:', data.type);

            const msg: { hash: string; content: any } = JSON.parse(data.message);

            switch (data.type) {
                case MESSAGE_TYPE.HANDSHAKE: {
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
                        console.log('sending boot info...');
                        const content = {
                            nodes: this.DHT.getClosestNodes(newPeer.nodeID, BUCKET_SIZE),
                            state: globalStateStore.toJSON(),
                            blockchain: this.info.blockchain.toJSON(),
                        };

                        this.sendData(
                            socket,
                            MESSAGE_TYPE.RESPONSE_BOOT_INFO,
                            { content },
                            newPeer,
                        );
                    } else {
                        //
                    }
                    break;
                }

                case MESSAGE_TYPE.RESPONSE_BOOT_INFO: {
                    console.log(msg.content);
                    this.bootSocket = socket;

                    const content: {
                        nodes: Peer[];
                        state: AccountType[];
                        blockchain: BlockType[];
                    } = msg.content;
                    console.log('updating global store...');
                    globalStateStore.syncStore(content.state);
                    console.log('updating blockchain...');
                    this.info.blockchain.syncBlockchain(content.blockchain);

                    console.log(`connecting to discovered ${content.nodes.length} nodes...`);
                    if (content.nodes.length > BUCKET_SIZE) {
                        return console.log('invalid nodes'.red);
                    }

                    Promise.allSettled(
                        content.nodes.map((peer) => {
                            this.DHT.addNewNode(peer); // can't return evicted here
                            return this.connectToClosestNode(peer);
                        }),
                    ).then(() => {
                        console.log('nodes added'.green);
                        // publishing new account
                        this.publish(PUBLICATION_TYPE.PUB_NEW_ACCOUNT, this.info.account.toJSON());
                    });
                    break;
                }

                case PUBLICATION_TYPE.PUB_PING:
                case PUBLICATION_TYPE.PUB_NEW_ACCOUNT:
                case PUBLICATION_TYPE.PUB_NEW_BLOCK:
                case PUBLICATION_TYPE.PUB_TRANSACTION: {
                    const subType = `SUB${data.type.slice(3)}` as SUBSCRIPTION_TYPE;
                    const sub = this.subscriptions.get(subType);

                    if (sub?.receivedHashes.includes(msg.hash)) {
                        return console.log(`already received this ${data.type}`.dim);
                    }
                    sub?.addHash(msg.hash);

                    // working with data

                    switch (data.type) {
                        case PUBLICATION_TYPE.PUB_PING: {
                            console.log(msg.content);
                            break;
                        }

                        case PUBLICATION_TYPE.PUB_NEW_ACCOUNT: {
                            try {
                                const content: AccountType = msg.content;
                                console.log(content);
                                const newAccount = new Account(content);
                                globalStateStore.addAccount(newAccount);
                            } catch (e) {
                                console.log(`Received some trash: ${e}`);
                            }

                            break;
                        }

                        case PUBLICATION_TYPE.PUB_TRANSACTION: {
                            try {
                                const content: TransactionType = msg.content;
                                console.log(content);
                                const tx = new Transaction(content);
                                console.log(
                                    Transaction.verifyTransaction(tx)
                                        ? 'VALID TX'.green
                                        : 'INVALID TX'.red,
                                );
                                this.info.blockchain.addNewTransaction(tx);
                            } catch (e) {
                                console.log(`Received some trash: ${e}`);
                            }
                            break;
                        }

                        case PUBLICATION_TYPE.PUB_NEW_BLOCK: {
                            try {
                                const content: BlockType = msg.content;
                                console.log(content);
                                const block = new Block(content);
                                this.info.blockchain.addReceivedBlock(block);
                            } catch (e) {
                                console.log(`Received some trash: ${e}`);
                            }
                            break;
                        }
                    }

                    // propagate further
                    if (this.port !== BOOT_NODE_PORT) {
                        for (const val of this.peers.values()) {
                            if (val.socket !== socket) {
                                this.sendData(val.socket, data.type, msg, peer);
                            }
                        }
                    }

                    break;
                }

                default:
                    console.warn('Invalid message type');
            }
        });

        socket.on('error', (err) => {
            const peer = Array.from(this.peers.values()).find((val) => val.socket === socket)?.peer;
            if (peer) {
                process.stdout.write(`removing ${peer.nodeID} on port=${peer.port}... `);
                console.log(this.DHT.removeNode(peer.nodeID) ? 'removed'.green : 'not removed'.red);
                this.peers.delete(peer.nodeID);
            }
            console.log(
                `[node ${this.port} | ${type}] connection failed ${err.name}: ${err.message}`.red,
            );
        });

        socket.on('close', () => {
            console.log(
                `[node ${this.port} | ${type}] connection closed with port=${socket.remotePort}`,
            );
        });
    }

    sendData(
        socket: net.Socket,
        type: MESSAGE_TYPE | PUBLICATION_TYPE,
        message: { hash?: string; content: any },
        peer?: Peer,
    ) {
        let data = {
            type: type,
            message: JSON.stringify(message),
        };

        socket.write(JSON.stringify(data));

        console.log(
            `[node ${this.port} | client] sent ${type} to ${
                peer
                    ? `port=${peer.port}`
                    : `${socket !== this.bootSocket ? 'UNKNOWN ' : ''}port=${socket.remotePort}`
            }`.black.bgCyan,
        );
    }

    publish(type: PUBLICATION_TYPE, content: any) {
        const data = {
            hash: crypto.randomBytes(8).toString('hex'),
            content,
        };

        console.log(`broadcasting ${type} to ${this.peers.size + (this.bootSocket ? 1 : 0)} peers`);

        const subType = `SUB${type.slice(3)}` as SUBSCRIPTION_TYPE;
        this.subscriptions.get(subType)?.addHash(data.hash); // to not receive own publication

        this.bootSocket && this.sendData(this.bootSocket, type, data);
        for (const val of this.peers.values()) {
            this.sendData(val.socket, type, data, val.peer);
        }
    }

    makeTransaction(to: string, amount: string) {
        try {
            if (to.length !== 40) {
                throw new Error('invalid receiver address');
            }
            const tx = this.info.initiateTransaction(to, parseInt(amount));
            this.publish(PUBLICATION_TYPE.PUB_TRANSACTION, tx);
        } catch (e) {
            console.log(`Transaction rejected: ${e}`);
        }
    }

    mineBlock() {
        this.info.blockchain
            .addNewBlock()
            .then((block) => {
                console.log(block);
                this.publish(PUBLICATION_TYPE.PUB_NEW_BLOCK, block);
            })
            .catch((e) => console.log(`Mining rejected: ${e}`));
        console.log('its not blocked');
    }

    printPool() {
        console.log('pending:', this.info.blockchain.transactionPool.toJSON());
    }

    printChain() {
        console.log(JSON.stringify(this.info.blockchain.toJSON(), null, 2));
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
