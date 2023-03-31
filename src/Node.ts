import * as net from 'net';
import * as crypto from 'crypto';
import { globalStateStore } from '.';
import Account from './Account';
import Blockchain from './Blockchain';
import KademliaTable from './KademliaTable';

const TEMP__HOST = '127.0.0.1';
const MAX_KADEMLIA_SIZE = 20;

const BOOTSTRAPPING_NODE_HOST = TEMP__HOST;
const BOOTSTRAPPING_NODE_PORT = 3001;

enum MESSAGE_TYPE {
    PING = 'PING',
    PONG = 'PONG',

    HANDSHAKE = 'HANDSHAKE',
    RESPONSE_CLOSEST_NODES = 'RESPONSE_CLOSEST_NODES',
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
    peers: Map<string, { socket: net.Socket; hash: string }>;

    constructor(port: number) {
        this.port = port;
        this.server = net.createServer();
        this.nodeID = Node.generateNodeID();
        this.DHT = new KademliaTable(this.nodeID, MAX_KADEMLIA_SIZE);

        this.peers = new Map();
    }

    static generateNodeID(): Buffer {
        return crypto.randomBytes(20);
    }

    initServer() {
        this.server.on('connection', (socket) => {
            console.log(
                `[node ${this.port} | server] established connection: ${socket.localAddress}:${socket.localPort} -> ${socket.remoteAddress}:${socket.remotePort}`
                    .yellow,
            );
            if (socket.remoteAddress && socket.remotePort) {
                this.handleConnection('server', socket);
            } else {
                console.log(`[node ${this.port} | server] connection invalid`);
            }
        });

        this.server.listen({ port: this.port, host: TEMP__HOST }, () => {
            console.log(
                `[node ${this.port} | server] server listening on PORT ${
                    this.port
                }\n           | id: ${this.nodeID.toString('hex')}`,
            );
        });
    }

    joinNetwork() {
        if (this.port !== BOOTSTRAPPING_NODE_PORT) {
            setTimeout(() => {
                console.log('connecting to bootstrapping node');
                this.connectToBootstrappingNode();
            }, 2000);
        }
    }

    connectToBootstrappingNode(): void {
        const socket = net.createConnection({ port: BOOTSTRAPPING_NODE_PORT });

        socket.on('connect', () => {
            console.log(
                `[node ${this.port} | client] established connection ${socket.localAddress}:${socket.localPort} -> ${socket.remoteAddress}:${socket.remotePort}`
                    .yellow,
            );

            this.sendData(socket, MESSAGE_TYPE.HANDSHAKE);
            this.handleConnection('client', socket);
        });
    }

    connectToClosestNode(peer: Peer): void {
        console.log('Trying to connect to ', peer.portToConnect);
        const socket = net.createConnection({ port: peer.portToConnect }, () => {
            console.log(
                `[node ${this.port} | client] established connection ${socket.localAddress}:${socket.localPort} -> ${socket.remoteAddress}:${socket.remotePort}`
                    .yellow,
            );

            this.sendData(socket, MESSAGE_TYPE.HANDSHAKE);
            this.peers.set(`${socket.remoteAddress}:${socket.remotePort}`, {
                socket,
                hash: peer.hashID,
            });
            this.handleConnection('client', socket);
        });
    }

    public handleConnection(type: 'client' | 'server', socket: net.Socket): void {
        socket.on('data', (response) => {
            console.log(
                `[node ${this.port} | ${type}] received message ${socket.localAddress}:${socket.localPort} -> ${socket.remoteAddress}:${socket.remotePort}`
                    .cyan,
            );

            let data = JSON.parse(response.toString());
            console.log('           | content:', data.type);

            switch (data.type) {
                case MESSAGE_TYPE.PING:
                    this.sendData(socket, MESSAGE_TYPE.PONG);
                    break;

                case MESSAGE_TYPE.PONG:
                    console.log('PONG');
                    break;

                case MESSAGE_TYPE.HANDSHAKE:
                    console.log('adding new node into DHT');
                    console.log(data.message);
                    const newPeer: Peer = JSON.parse(data.message);

                    this.DHT.addNewNode(newPeer);
                    this.peers.set(`${socket.remoteAddress}:${socket.remotePort}`, {
                        socket,
                        hash: newPeer.hashID,
                    });
                    console.log('node added');

                    if (this.port === BOOTSTRAPPING_NODE_PORT) {
                        this.sendData(socket, MESSAGE_TYPE.RESPONSE_CLOSEST_NODES, newPeer.hashID);
                    }

                    break;

                case MESSAGE_TYPE.RESPONSE_CLOSEST_NODES:
                    console.log('connecting to discovered nodes');
                    const nodes = JSON.parse(data.message);
                    nodes.forEach((peer: Peer) => this.DHT.addNewNode(peer));
                    nodes.forEach((peer: Peer) => this.connectToClosestNode(peer));
                    console.log('nodes added');

                    break;

                default:
                    console.warn('Invalid message type');
            }
        });

        socket.on('error', (err) => {
            console.log(`[node ${this.port} | ${type}] connection failed with ${err}`.red);
        });

        socket.on('close', () => {
            if (socket.remoteAddress && socket.remotePort) {
                const peer = this.peers.get(`${socket.remoteAddress}:${socket.remotePort}`);
                if (peer) {
                    console.log(`removing ${peer.hash} from DHT`);
                    console.log(this.DHT.removeNode(peer.hash) ? 'removed' : 'not removed');
                    this.peers.delete(`${socket.remoteAddress}:${socket.remotePort}`);
                }
            }

            console.log(
                `[node ${this.port} | ${type}] connection closed with ${socket.remoteAddress}:${socket.remotePort}`
                    .dim,
            );
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

            case MESSAGE_TYPE.PONG:
                data.message = `PONG`;
                break;

            case MESSAGE_TYPE.HANDSHAKE:
                data.message = JSON.stringify({
                    hashID: this.nodeID.toString('hex'),
                    host: TEMP__HOST,
                    portSocket: socket.localPort,
                    portToConnect: this.port,
                } as Peer);
                break;

            case MESSAGE_TYPE.RESPONSE_CLOSEST_NODES:
                data.message = JSON.stringify(
                    optionalData ? this.DHT.getClosestNodes(optionalData) : [],
                );
                break;
        }

        socket.write(JSON.stringify(data));

        console.log(
            `[node ${this.port} | client] sent data ${socket.localAddress}:${socket.localPort} -> ${socket.remoteAddress}:${socket.remotePort}`,
        );
    }

    getConnections() {
        console.log('open sockets: [');
        this.peers.forEach((val, key) => console.log(`${key}  |  ${val.hash}`));
        console.log(']');

        this.DHT.toJSON().forEach((val) => console.log(val[0], ':', val[1]));
    }

    broadcastPing() {
        for (const { socket } of this.peers.values()) {
            this.sendData(socket, MESSAGE_TYPE.PING);
        }
    }

    ping(port: number) {
        const peer = this.peers.get(`${TEMP__HOST}:${port}`);
        if (peer) {
            this.sendData(peer.socket, MESSAGE_TYPE.PING);
        }
    }
}
