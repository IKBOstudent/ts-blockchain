import * as net from "net";
import * as crypto from "crypto";
import { globalStateStore } from ".";
import { Account, AccountType } from "./Account";
import Blockchain from "./Blockchain";
import KademliaTable from "./KademliaTable";
import { generateAddress, generatePublicPrivateKeys } from "./utils";
import { Transaction, TransactionType } from "./Transaction";

const TEMP__HOST = "127.0.0.1";
const MAX_KADEMLIA_SIZE = 4;

export const HASH_LEN = 8;

const BOOT_NODE_PORT = 3001;

enum MESSAGE_TYPE {
    HANDSHAKE = "HANDSHAKE",
    RESPONSE_CLOSEST_NODES = "RESPONSE_CLOSEST_NODES",
}

enum SUBSCRIPTION_TYPE {
    SUB_PING = "SUB_PING",
    SUB_SYNC = "SUB_SYNC",
    SUB_NEW_ACCOUNT = "SUB_NEW_ACCOUNT",
    SUB_NEW_BLOCK = "SUB_NEW_BLOCK",
    SUB_TRANSACTION = "SUB_TRANSACTION",
}

enum PUBLICATION_TYPE {
    PUB_PING = "PUB_PING",
    PUB_SYNC = "PUB_SYNC",
    PUB_NEW_ACCOUNT = "PUB_NEW_ACCOUNT",
    PUB_NEW_BLOCK = "PUB_NEW_BLOCK",
    PUB_TRANSACTION = "PUB_TRANSACTION",
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
            this.receivedHashes = this.receivedHashes.slice(128, 256);
        }
        this.receivedHashes.push(hash);
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
        console.log(this.account.toJSON());
        this.blockchain = new Blockchain(this.account);
    }

    initiateTransaction(to: string, value: number): TransactionType {
        const tx = this.account.initiateTransaction(to, value, this.account.nonce, this.privateKey);
        console.log(tx.verifyTransaction());
        this.blockchain.addNewTransaction(tx);
        return tx.toJSON();
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

    info: NodeBlockchainInfo;

    subscriptions: Map<SUBSCRIPTION_TYPE, Subscription>;

    constructor(port: number) {
        this.port = port;
        this.server = net.createServer();
        this.nodeID = Node.generateNodeID();
        this.DHT = new KademliaTable(this.nodeID, MAX_KADEMLIA_SIZE, this.port === BOOT_NODE_PORT);

        this.peers = new Map();
        this.subscriptions = new Map();
        for (let type in SUBSCRIPTION_TYPE) {
            this.subscriptions.set(type as SUBSCRIPTION_TYPE, new Subscription(type as SUBSCRIPTION_TYPE));
        }

        this.info = new NodeBlockchainInfo();
    }

    static generateNodeID(): Buffer {
        return crypto.randomBytes(HASH_LEN);
    }

    initServer(): void {
        this.server.on("connection", socket => {
            console.log(`[node ${this.port} | server] established connection with port=${socket.remotePort}`.yellow);

            if (socket.remotePort) {
                this.handleConnection("server", socket);
            } else {
                console.log(`[node ${this.port} | server] connection invalid`.black.bgRed);
            }
        });

        this.server.listen({ port: this.port, host: TEMP__HOST }, () => {
            console.log(
                `[node ${this.port} | server] server listening on PORT ${
                    this.port
                }\n           | id: ${this.nodeID.toString("hex")}`
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

        socket.on("connect", () => {
            console.log(`[node ${this.port} | client] established connection with port=${BOOT_NODE_PORT}`.yellow);

            this.sendData(socket, MESSAGE_TYPE.HANDSHAKE, {
                hash: "",
                content: {
                    hashID: this.nodeID.toString("hex"),
                    portToConnect: this.port,
                },
            });
            this.handleConnection("client", socket);
        });

        socket.on("error", err => {
            console.log(`[node ${this.port} | client] BOOT node unavaliable ${err}`.red);
        });
    }

    connectToClosestNode(peer: Peer): void {
        console.log(`Trying to connect to port=${peer.portToConnect}`);
        const socket = net.createConnection({ port: peer.portToConnect }, () => {
            console.log(`[node ${this.port} | client] established connection with port=${peer.portToConnect}`.yellow);

            this.sendData(socket, MESSAGE_TYPE.HANDSHAKE, {
                hash: "",
                content: {
                    hashID: this.nodeID.toString("hex"),
                    portToConnect: this.port,
                },
            });
            this.peers.set(peer.hashID, { socket, peer });

            this.handleConnection("client", socket);
        });
    }

    handleConnection(type: "client" | "server", socket: net.Socket): void {
        socket.on("data", response => {
            const peer = this.findPeerBySocket(socket);
            console.log(
                `[node ${this.port} | ${type}] received message from ${
                    peer ? `port=${peer.portToConnect}` : `UNKNOWN port=${socket.remotePort}`
                }`.cyan
            );
            let data: { type: MESSAGE_TYPE | PUBLICATION_TYPE; message: string } = JSON.parse(response.toString());
            console.log("           | type:", data.type);

            const msg: { hash: string; content: any } = JSON.parse(data.message);

            switch (data.type) {
                case MESSAGE_TYPE.HANDSHAKE:
                    const newPeer: Peer = msg.content;
                    process.stdout.write(`adding new node: ${newPeer.hashID} | port=${newPeer.portToConnect}... `);

                    if (newPeer.hashID !== this.nodeID.toString("hex")) {
                        const res = this.DHT.addNewNode(newPeer);
                        this.peers.set(newPeer.hashID, { socket, peer: newPeer });
                        console.log("added".green);

                        if (!res.status && res.node) {
                            console.log(`disconnecting with port=${res.node.portToConnect}..`);
                            const item = this.peers.get(res.node.hashID);
                            if (item) {
                                item.socket.destroy();
                                this.peers.delete(res.node.hashID);
                                console.log("disconnected".green);
                            } else console.log("failed to disconnect".red);
                        }
                    } else console.log("not added".red);

                    if (this.port === BOOT_NODE_PORT) {
                        console.log("sending closest nodes...");
                        this.sendData(socket, MESSAGE_TYPE.RESPONSE_CLOSEST_NODES, {
                            hash: "",
                            content: this.DHT.getClosestNodes(newPeer.hashID, MAX_KADEMLIA_SIZE),
                        });
                    }
                    break;

                case MESSAGE_TYPE.RESPONSE_CLOSEST_NODES:
                    console.log("connecting to discovered nodes...");
                    const nodes: Peer[] = msg.content;

                    nodes.forEach(peer => {
                        console.log(`${peer.hashID} | port=${peer.portToConnect}`);
                        this.DHT.addNewNode(peer);
                        this.connectToClosestNode(peer);
                    });
                    console.log("nodes added".green);
                    setTimeout(() => this.publish(2), 1000);
                    break;

                case PUBLICATION_TYPE.PUB_PING:
                case PUBLICATION_TYPE.PUB_SYNC:
                case PUBLICATION_TYPE.PUB_NEW_ACCOUNT:
                case PUBLICATION_TYPE.PUB_NEW_BLOCK:
                case PUBLICATION_TYPE.PUB_TRANSACTION:
                    const subType = `SUB${data.type.slice(3)}` as SUBSCRIPTION_TYPE;
                    const sub = this.subscriptions.get(subType);

                    if (sub?.receivedHashes.includes(msg.hash)) {
                        console.log(`already received this ${data.type}`.dim);
                    } else {
                        const content = JSON.parse(msg.content);
                        console.log(content);
                        if (data.type === PUBLICATION_TYPE.PUB_NEW_ACCOUNT) {
                            const newAccount = new Account(content);
                            globalStateStore.addAccount(newAccount);
                        } else if (data.type === PUBLICATION_TYPE.PUB_TRANSACTION) {
                            const tx = new Transaction(content);
                            console.log(tx.verifyTransaction() ? "VALID TX".green : "INVALID TX".red);
                            this.info.blockchain.addNewTransaction(tx);
                        }
                        sub?.addHash(msg.hash);
                        for (const val of this.peers.values()) {
                            if (val.socket !== socket) {
                                this.sendData(val.socket, data.type, msg);
                            }
                        }
                    }
                    break;

                default:
                    console.warn("Invalid message type");
            }
        });

        socket.on("error", err => {
            console.log(`[node ${this.port} | ${type}] connection failed ${err}`.red);
        });

        socket.on("close", () => {
            const peer = this.findPeerBySocket(socket);
            if (peer) {
                process.stdout.write(`removing ${peer.hashID} on port=${peer.portToConnect}... `);
                console.log(this.DHT.removeNode(peer.hashID) ? "removed".green : "not removed".red);
                this.peers.delete(peer.hashID);
            }

            console.log(`[node ${this.port} | ${type}] connection closed with port=${socket.remotePort}`);
        });
    }

    sendData(socket: net.Socket, type: MESSAGE_TYPE | PUBLICATION_TYPE, message: { hash: string; content: any }) {
        let data = {
            type: type,
            message: JSON.stringify(message),
        };

        socket.write(JSON.stringify(data));

        const peer = this.findPeerBySocket(socket);
        console.log(
            `[node ${this.port} | client] sent ${type} to ${
                peer ? `port=${peer.portToConnect}` : `UNKNOWN port=${socket.remotePort}`
            }`.black.bgCyan
        );
    }

    publish(type: number) {
        const pubType = Object.values(PUBLICATION_TYPE)[type];
        let content;
        switch (pubType) {
            case PUBLICATION_TYPE.PUB_PING:
                content = "PING";
                break;

            case PUBLICATION_TYPE.PUB_SYNC:
                content = "GS";
                break;

            case PUBLICATION_TYPE.PUB_NEW_ACCOUNT:
                content = this.info.account.toJSON();
                break;

            case PUBLICATION_TYPE.PUB_NEW_BLOCK:
                content = "NB";
                break;

            default:
                console.log("Invalid type");
        }
        const data = { hash: crypto.randomBytes(8).toString("hex"), content: JSON.stringify(content) };
        console.log(`broadcasting ${pubType} with hash ${data.hash}`);
        const subType = `SUB${pubType.slice(3)}` as SUBSCRIPTION_TYPE;
        this.subscriptions.get(subType)?.addHash(data.hash);

        for (const val of this.peers.values()) {
            this.sendData(val.socket, pubType, data);
        }
    }

    makeTransaction(to: string, amount: string) {
        const tx = this.info.initiateTransaction(to, parseInt(amount));
        const data = { hash: crypto.randomBytes(8).toString("hex"), content: JSON.stringify(tx) };
        console.log(`broadcasting TX with hash ${data.hash}`);
        this.subscriptions.get(SUBSCRIPTION_TYPE.SUB_TRANSACTION)?.addHash(data.hash);

        for (const val of this.peers.values()) {
            this.sendData(val.socket, PUBLICATION_TYPE.PUB_TRANSACTION, data);
        }
    }

    printPool() {
        console.log(this.info.blockchain.toJSON());
    }

    printConnections() {
        let count = 0;
        this.DHT.toJSON().forEach(val => {
            count += val[1].length;
            process.stdout.write(
                `  ${String(val[0]).padStart(2, "0")}:  ${val[1][0].hashID} | port:${val[1][0].portToConnect}\n`.inverse
            );
            val[1]
                .slice(1)
                .forEach((peer, i) => console.log(`       ${peer.hashID} | port:${peer.portToConnect}`.inverse));
        });
        if (count === 0) {
            console.log("no connections".inverse);
        }
        if (count !== this.peers.size) {
            console.log(`ERROR: have ${this.peers.size - count} not removed peers`.bgRed);
        }
    }

    printID() {
        console.log(this.nodeID.toString("hex"));
    }
}
