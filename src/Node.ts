import * as net from 'net';
import * as crypto from 'crypto';
import { globalStateStore } from '.';
import Account from './Account';
import Blockchain from './Blockchain';
import KademliaTable from './KademliaTable';

const TEMP__HOST = '127.0.0.1';
const MAX_KADEMLIA_SIZE = 4;

export const HASH_LEN = 8;

const BOOT_NODE_PORT = 3001;

enum MESSAGE_TYPE {
    HANDSHAKE = 'HANDSHAKE',
    RESPONSE_CLOSEST_NODES = 'RESPONSE_CLOSEST_NODES',
}

enum SUBSCRIPTION_TYPE {
    SUB_PING = 'SUB_PING',
    SUB_SYNC = 'SUB_SYNC',
    SUB_NEW_ACCOUNT = 'SUB_NEW_ACCOUNT',
    SUB_NEW_BLOCK = 'SUB_NEW_BLOCK',
}

enum PUBLICATION_TYPE {
    PUB_PING = 'PUB_PING',
    PUB_SYNC = 'PUB_SYNC',
    PUB_NEW_ACCOUNT = 'PUB_NEW_ACCOUNT',
    PUB_NEW_BLOCK = 'PUB_NEW_BLOCK',
}

class Subscription {
    type: SUBSCRIPTION_TYPE;
    receivedHashes: string[];

    constructor(type: SUBSCRIPTION_TYPE) {
        this.type = type;
        this.receivedHashes = [];
    }

    addHash(hash: string) {
        if (this.receivedHashes.length >= 256) {
            this.receivedHashes.pop();
        }
        this.receivedHashes.push(hash);
    }
}

export interface Peer {
    hashID: string;
    portToConnect: number;
}

export default class Node {
    // network info
    port: number;
    server: net.Server;
    nodeID: Buffer;
    DHT: KademliaTable;
    peers: Map<string, { socket: net.Socket; peer: Peer }>;

    subscriptions: Map<SUBSCRIPTION_TYPE, Subscription>;

    constructor(port: number) {
        this.port = port;
        this.server = net.createServer();
        this.nodeID = Node.generateNodeID();
        this.DHT = new KademliaTable(this.nodeID, MAX_KADEMLIA_SIZE, this.port === BOOT_NODE_PORT);

        this.peers = new Map();
        this.subscriptions = new Map();
        for (let type in SUBSCRIPTION_TYPE) {
            this.subscriptions.set(
                type as SUBSCRIPTION_TYPE,
                new Subscription(type as SUBSCRIPTION_TYPE),
            );
        }
    }

    static generateNodeID(): Buffer {
        return crypto.randomBytes(HASH_LEN);
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

        this.server.listen({ port: this.port, host: TEMP__HOST }, () => {
            console.log(
                `[node ${this.port} | server] server listening on PORT ${
                    this.port
                }\n           | id: ${this.nodeID.toString('hex')}`,
            );
        });
        this.joinNetwork();
    }

    joinNetwork(): void {
        if (this.port !== BOOT_NODE_PORT) {
            console.log(`connecting to BOOT node in ${(this.port % 100) * 1000}`.dim);
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
        return;
    }

    connectToBOOTNode(): void {
        const socket = net.createConnection({ port: BOOT_NODE_PORT });

        socket.on('connect', () => {
            console.log(
                `[node ${this.port} | client] established connection with port=${BOOT_NODE_PORT}`
                    .yellow,
            );

            this.sendData(socket, MESSAGE_TYPE.HANDSHAKE);
            this.handleConnection('client', socket);
        });

        socket.on('error', (err) => {
            console.log(`[node ${this.port} | client] BOOT node unavaliable ${err}`.red);
        });
    }

    connectToClosestNode(peer: Peer): void {
        console.log(`Trying to connect to port=${peer.portToConnect}`);
        const socket = net.createConnection({ port: peer.portToConnect }, () => {
            console.log(
                `[node ${this.port} | client] established connection with port=${peer.portToConnect}`
                    .yellow,
            );

            this.sendData(socket, MESSAGE_TYPE.HANDSHAKE);
            this.peers.set(peer.hashID, { socket, peer });

            this.handleConnection('client', socket);
        });
    }

    handleConnection(type: 'client' | 'server', socket: net.Socket): void {
        socket.on('data', (response) => {
            const peer = this.findPeerBySocket(socket);
            console.log(
                `[node ${this.port} | ${type}] received message from ${
                    peer ? `port=${peer.portToConnect}` : `UNKNOWN port=${socket.remotePort}`
                }`.cyan,
            );
            let data: { type: MESSAGE_TYPE | PUBLICATION_TYPE; message: string } = JSON.parse(
                response.toString(),
            );
            console.log('           | type:', data.type);

            switch (data.type) {
                case MESSAGE_TYPE.HANDSHAKE:
                    const newPeer: Peer = JSON.parse(data.message);
                    process.stdout.write(
                        `adding new node: ${newPeer.hashID} | port=${newPeer.portToConnect}... `,
                    );

                    if (newPeer.hashID !== this.nodeID.toString('hex')) {
                        const res = this.DHT.addNewNode(newPeer);
                        this.peers.set(newPeer.hashID, { socket, peer: newPeer });
                        console.log('added'.green);

                        if (!res.status && res.node) {
                            console.log(`disconnecting with port=${res.node.portToConnect}..`);
                            const item = this.peers.get(res.node.hashID);
                            if (item) {
                                item.socket.destroy();
                                this.peers.delete(res.node.hashID);
                                console.log('disconnected'.green);
                            } else console.log('failed to disconnect'.red);
                        }
                    } else console.log('not added'.red);

                    if (this.port === BOOT_NODE_PORT) {
                        console.log('sending closest nodes...');
                        this.sendData(socket, MESSAGE_TYPE.RESPONSE_CLOSEST_NODES, newPeer.hashID);
                    }
                    break;

                case MESSAGE_TYPE.RESPONSE_CLOSEST_NODES:
                    console.log('connecting to discovered nodes...');
                    const nodes: Peer[] = JSON.parse(data.message);
                    nodes.forEach((peer) => {
                        console.log(`${peer.hashID} | port=${peer.portToConnect}`);
                        this.DHT.addNewNode(peer);
                        this.connectToClosestNode(peer);
                    });
                    console.log('nodes added'.green);
                    break;

                case PUBLICATION_TYPE.PUB_PING:
                case PUBLICATION_TYPE.PUB_SYNC:
                case PUBLICATION_TYPE.PUB_NEW_ACCOUNT:
                case PUBLICATION_TYPE.PUB_NEW_BLOCK:
                    const subType = `SUB${data.type.slice(3)}` as SUBSCRIPTION_TYPE;
                    const msg: { hash: string; content: any } = JSON.parse(data.message);
                    const sub = this.subscriptions.get(subType);

                    if (sub?.receivedHashes.includes(msg.hash)) {
                        console.log(`already received this ${data.type}`.dim);
                    } else {
                        console.log(`${msg.content}`.bold);
                        sub?.addHash(msg.hash);
                        console.log(`propagating to ${this.peers.size - 1} neighbours...`);
                        let timeout = 1000;
                        for (const value of this.peers.values()) {
                            if (value.socket !== socket) {
                                setTimeout(
                                    () => this.sendData(value.socket, data.type, msg.hash),
                                    timeout,
                                );
                                timeout += 1000;
                            }
                        }
                    }
                    break;

                default:
                    console.warn('Invalid message type');
            }
        });

        socket.on('error', (err) => {
            console.log(`[node ${this.port} | ${type}] connection failed ${err}`.red);
        });

        socket.on('close', () => {
            const peer = this.findPeerBySocket(socket);
            if (peer) {
                process.stdout.write(`removing ${peer.hashID} on port=${peer.portToConnect}... `);
                console.log(this.DHT.removeNode(peer.hashID) ? 'removed'.green : 'not removed'.red);
                this.peers.delete(peer.hashID);
            }

            console.log(
                `[node ${this.port} | ${type}] connection closed with port=${socket.remotePort}`,
            );
        });
    }

    sendData(socket: net.Socket, type: MESSAGE_TYPE | PUBLICATION_TYPE, optionalData?: string) {
        let data: { type: MESSAGE_TYPE | PUBLICATION_TYPE; message: string } = {
            type: type,
            message: '',
        };

        switch (type) {
            case MESSAGE_TYPE.HANDSHAKE:
                data.message = JSON.stringify({
                    hashID: this.nodeID.toString('hex'),
                    portToConnect: this.port,
                } as Peer);
                break;

            case MESSAGE_TYPE.RESPONSE_CLOSEST_NODES:
                if (optionalData) {
                    data.message = JSON.stringify(this.DHT.getClosestNodes(optionalData));
                } else console.log("can't send closet nodes");

                break;

            case PUBLICATION_TYPE.PUB_PING:
                if (optionalData) {
                    this.subscriptions.get(SUBSCRIPTION_TYPE.SUB_PING)?.addHash(optionalData);
                    data.message = JSON.stringify({
                        hash: optionalData,
                        content: 'PING',
                    });
                } else console.log("can't publish PUB_PING");
                break;

            case PUBLICATION_TYPE.PUB_SYNC:
                if (optionalData) {
                    this.subscriptions.get(SUBSCRIPTION_TYPE.SUB_SYNC)?.addHash(optionalData);
                    data.message = JSON.stringify({
                        hash: optionalData,
                        content: 'STATE SHARED',
                    });
                } else console.log("can't publish PUB_SYNC");
                break;

            case PUBLICATION_TYPE.PUB_NEW_ACCOUNT:
                if (optionalData) {
                    this.subscriptions
                        .get(SUBSCRIPTION_TYPE.SUB_NEW_ACCOUNT)
                        ?.addHash(optionalData);
                    data.message = JSON.stringify({
                        hash: optionalData,
                        content: 'NEW ACCOUNT',
                    });
                } else console.log("can't publish PUB_NEW_ACCOUNT");
                break;

            case PUBLICATION_TYPE.PUB_NEW_BLOCK:
                if (optionalData) {
                    this.subscriptions.get(SUBSCRIPTION_TYPE.SUB_NEW_BLOCK)?.addHash(optionalData);
                    data.message = JSON.stringify({
                        hash: optionalData,
                        content: 'NEW BLOCK',
                    });
                } else console.log("can't publish PUB_NEW_BLOCK");
                break;

            default:
                console.log('invalid message type');
        }

        socket.write(JSON.stringify(data));

        const peer = this.findPeerBySocket(socket);
        console.log(
            `[node ${this.port} | client] sent data to ${
                peer ? `port=${peer.portToConnect}` : `UNKNOWN port=${socket.remotePort}`
            }`.black.bgCyan,
        );
    }

    publish(type: number) {
        const pubType = Object.values(PUBLICATION_TYPE)[type];
        const hash = crypto.randomBytes(16).toString('hex');
        console.log(`broadcasting ${pubType} with hash ${hash}`);
        let timeout = 1000;
        for (const value of this.peers.values()) {
            setTimeout(() => this.sendData(value.socket, pubType, hash), timeout);
            timeout += 1000;
        }
    }

    printConnections() {
        let count = 0;
        this.DHT.toJSON().forEach((val) => {
            count += val[1].length;
            process.stdout.write(
                `  ${String(val[0]).padStart(2, '0')}:  ${val[1][0].hashID} | port:${
                    val[1][0].portToConnect
                }\n`.inverse,
            );
            val[1]
                .slice(1)
                .forEach((peer, i) =>
                    console.log(`       ${peer.hashID} | port:${peer.portToConnect}`.inverse),
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
        console.log(this.nodeID.toString('hex'));
    }
}
