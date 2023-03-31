import * as net from "net";
import * as crypto from "crypto";
import { globalStateStore } from ".";
import Account from "./Account";
import Blockchain from "./Blockchain";
import KademliaTable from "./KademliaTable";

const TEMP__HOST = "127.0.0.1";
const MAX_KADEMLIA_SIZE = 2;

const BOOTSTRAPPING_NODE_HOST = TEMP__HOST;
const BOOTSTRAPPING_NODE_PORT = 3001;

enum MESSAGE_TYPE {
    PING = "PING",
    PONG = "PONG",

    BROADCAST_PING = "BROADCAST_PING",

    HANDSHAKE = "HANDSHAKE",
    RESPONSE_CLOSEST_NODES = "RESPONSE_CLOSEST_NODES",
}

export interface Peer {
    hashID: string;
    host: string;
    portSocket: number;
    portToConnect: number;
}

export default class Node {
    // network info
    port: number;
    server: net.Server;
    nodeID: Buffer;
    DHT: KademliaTable;
    peers: Map<string, { socket: net.Socket; peer: Peer }>;
    topicPing: { lastHash: string };

    constructor(port: number) {
        this.port = port;
        this.server = net.createServer();
        this.nodeID = Node.generateNodeID();
        this.DHT = new KademliaTable(this.nodeID, MAX_KADEMLIA_SIZE, this.port === BOOTSTRAPPING_NODE_PORT);

        this.peers = new Map();
        this.topicPing = { lastHash: "" };
    }

    static generateNodeID(): Buffer {
        return crypto.randomBytes(20);
    }

    initServer() {
        this.server.on("connection", socket => {
            console.log(
                `[node ${this.port} | server] established connection: port=${socket.localPort} -> port=${socket.remotePort}`
                    .yellow
            );
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

    joinNetwork() {
        if (this.port !== BOOTSTRAPPING_NODE_PORT) {
            console.log("connecting to bootstrapping node in 2s".dim);
            setTimeout(() => {
                this.connectToBootstrappingNode();
            }, 2000);
        }
    }

    connectToBootstrappingNode(): void {
        const socket = net.createConnection({ port: BOOTSTRAPPING_NODE_PORT });

        socket.on("connect", () => {
            console.log(
                `[node ${this.port} | client] established connection port=${socket.localPort} -> port=${socket.remotePort}`
                    .yellow
            );

            this.sendData(socket, MESSAGE_TYPE.HANDSHAKE);
            this.handleConnection("client", socket);
        });
        socket.on("error", err => {
            console.log(`[node ${this.port} | client] connection failed with ${err}`.red);
        });
    }

    connectToClosestNode(peer: Peer): void {
        console.log(`Trying to connect to ${peer.host}:${peer.portToConnect}`);
        const socket = net.createConnection({ port: peer.portToConnect }, () => {
            console.log(
                `[node ${this.port} | client] established connection port=${socket.localPort} -> port=${socket.remotePort}`
                    .yellow
            );

            this.sendData(socket, MESSAGE_TYPE.HANDSHAKE);
            this.peers.set(peer.hashID, { socket, peer });

            this.handleConnection("client", socket);
        });
    }

    public handleConnection(type: "client" | "server", socket: net.Socket): void {
        socket.on("data", response => {
            console.log(
                `[node ${this.port} | ${type}] received message port=${socket.localPort} -> port=${socket.remotePort}`
                    .cyan
            );

            let data = JSON.parse(response.toString());
            console.log("           | content:", data.type);

            switch (data.type) {
                case MESSAGE_TYPE.PING:
                    this.sendData(socket, MESSAGE_TYPE.PONG);
                    break;

                case MESSAGE_TYPE.BROADCAST_PING:
                    const pingMessage = JSON.parse(data.message);

                    if (this.topicPing.lastHash !== pingMessage.hash) {
                        console.log(`received PING:${pingMessage.hash}`);

                        this.topicPing.lastHash = pingMessage.hash;
                        console.log(`broadcasting further except ${pingMessage.from}`);

                        for (const { socket, peer } of this.peers.values()) {
                            if (peer.hashID !== pingMessage.from) {
                                this.sendData(socket, MESSAGE_TYPE.BROADCAST_PING, pingMessage.hash);
                            }
                        }
                    } else {
                        console.log(`received same PING`);
                    }

                    break;

                case MESSAGE_TYPE.PONG:
                    console.log("PONG");
                    break;

                case MESSAGE_TYPE.HANDSHAKE:
                    const newPeer: Peer = JSON.parse(data.message);
                    process.stdout.write(`adding new node: ${newPeer.hashID} | port=${newPeer.portToConnect}... `);

                    if (newPeer.hashID !== this.nodeID.toString("hex")) {
                        const res = this.DHT.addNewNode(newPeer);
                        this.peers.set(newPeer.hashID, { socket, peer: newPeer });
                        console.log("added".green);
                        if (!res.status && res.node) {
                            const item = this.peers.get(res.node.hashID);
                            if (item) {
                                item.socket.destroy();
                                this.peers.delete(res.node.hashID);
                            }
                        }
                    } else {
                        console.log("not added".red);
                    }

                    if (this.port === BOOTSTRAPPING_NODE_PORT) {
                        console.log("sending closest nodes");
                        this.sendData(socket, MESSAGE_TYPE.RESPONSE_CLOSEST_NODES, newPeer.hashID);
                    }

                    break;

                case MESSAGE_TYPE.RESPONSE_CLOSEST_NODES:
                    console.log("connecting to discovered nodes...");
                    const nodes: Peer[] = JSON.parse(data.message);
                    nodes.forEach(peer => console.log(`${peer.hashID} | port=${peer.portToConnect}`));
                    nodes.forEach(peer => this.DHT.addNewNode(peer));
                    console.log("nodes added".green);
                    nodes.forEach(peer => this.connectToClosestNode(peer));
                    break;

                default:
                    console.warn("Invalid message type");
            }
        });

        socket.on("error", err => {
            console.log(`[node ${this.port} | ${type}] connection failed with ${err}`.red);
        });

        socket.on("close", () => {
            if (socket.remotePort) {
                const findHash = () => {
                    for (let [key, value] of this.peers.entries()) {
                        if (value.socket === socket) {
                            return key;
                        }
                    }
                    return;
                };
                const peerId = findHash();
                if (peerId) {
                    process.stdout.write(`removing ${peerId}... `);
                    console.log(this.DHT.removeNode(peerId) ? "removed".green : "not removed".red);
                    this.peers.delete(peerId);
                }
            }

            console.log(`[node ${this.port} | ${type}] connection closed with port=${socket.remotePort}`.dim);
        });
    }

    sendData(socket: net.Socket, type: MESSAGE_TYPE, optionalData?: string) {
        let data: { type: MESSAGE_TYPE; message?: string } = {
            type: type,
        };

        switch (type) {
            case MESSAGE_TYPE.PING:
                data.message = `PING`;
                break;

            case MESSAGE_TYPE.BROADCAST_PING:
                data.message = JSON.stringify({ from: this.nodeID.toString("hex"), hash: optionalData || "" });
                break;

            case MESSAGE_TYPE.PONG:
                data.message = `PONG`;
                break;

            case MESSAGE_TYPE.HANDSHAKE:
                data.message = JSON.stringify({
                    hashID: this.nodeID.toString("hex"),
                    host: TEMP__HOST,
                    portSocket: socket.localPort,
                    portToConnect: this.port,
                } as Peer);
                break;

            case MESSAGE_TYPE.RESPONSE_CLOSEST_NODES:
                data.message = JSON.stringify(optionalData ? this.DHT.getClosestNodes(optionalData) : []);
                break;

            default:
                console.log("invalid message type");
        }

        socket.write(JSON.stringify(data));

        console.log(`[node ${this.port} | client] sent data port=${socket.localPort} -> port=${socket.remotePort}`);
    }

    getConnections() {
        this.DHT.toJSON().forEach(val => {
            console.log(`  ${String(val[0]).padStart(2, "0")}: [`);
            val[1].forEach((peer, i) => console.log(`         ${peer.hashID} | port:${peer.portToConnect}`));
            console.log("      ]");
        });
    }

    broadcastPing() {
        const generatedHash = crypto.randomBytes(20).toString("hex");
        this.topicPing.lastHash = generatedHash;
        console.log(`broadcastring PING:${generatedHash}`);
        for (const { socket } of this.peers.values()) {
            this.sendData(socket, MESSAGE_TYPE.BROADCAST_PING, generatedHash);
        }
    }

    ping(hash: string) {
        const item = this.peers.get(hash);
        if (item) {
            this.sendData(item.socket, MESSAGE_TYPE.PING);
        }
    }
}
