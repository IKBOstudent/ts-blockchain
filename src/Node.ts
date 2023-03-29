import * as net from 'net';
import { globalStateStore } from '.';
import Account from './Account';
import Blockchain from './Blockchain';

const TEMP__NUM_NODES = 3;
const START_PORT = 3001;

enum TYPES {
    MESSAGE = 'MESSAGE',
    QUERY = 'QUERY',
}

enum MESSAGE_TYPE {
    BROADCAST_HELLO = 'BROADCAST_HELLO',
    BROADCAST_NEW_ACCOUNT = 'BROADCAST_NEW_ACCOUNT',
    BROADCAST_NEW_BLOCK = 'BROADCAST_NEW_BLOCK',

    RESPONSE_CONNECTION_STATUS = 'RESPONSE_CONNECTION_STATUS',
    RESPONSE_GLOBAL_STATE = 'RESPONSE_GLOBAL_STATE',
    RESPONSE_LATEST_BLOCK = 'RESPONSE_LATEST_BLOCK',
}

enum QUERY_TYPE {
    GET_CONNECTION_STATUS = 'GET_CONNECTION_STATUS',
    GET_GLOBAL_STATE = 'GET_GLOBAL_STATE',
    GET_LATEST_BLOCK = 'GET_LATEST_BLOCK',
}

export default class Node {
    port: number;
    server: net.Server;
    openConnections: Map<number, net.Socket>;

    account: Account;

    constructor(port: number) {
        this.port = port;
        this.openConnections = new Map();
        this.server = net.createServer();

        this.account = new Account();
        globalStateStore.addAccount(this.account);
    }

    initServer() {
        this.server.addListener('connection', (socket) => {
            console.log(
                `[node ${this.port} | server] established connection: ${socket.localAddress}:${socket.localPort} -> ${socket.remoteAddress}:${socket.remotePort}`,
            );
            this.handleConnection('server', socket);

            socket.on('error', (err) => {
                console.log(`[node ${this.port} | server] connection failed with ${err}`);
            });
        });

        this.server.listen({ port: this.port, host: '127.0.0.1' }, () => {
            console.log(`[node ${this.port} | server] server listening on PORT ${this.port}`);
        });
    }

    initConnections() {
        for (let i = 0; i < TEMP__NUM_NODES; i++) {
            const port = START_PORT + i;
            if (port !== this.port) {
                this.connectToPeer(port);
            }
        }
    }

    connectToPeer(port: number): void {
        // create connection with each peer
        const socket = net.createConnection({ port });

        socket.on('connect', () => {
            console.log(
                `[node ${this.port} | client] established connection ${socket.localAddress}:${socket.localPort} -> ${socket.remoteAddress}:${socket.remotePort}`,
            );

            this.openConnections.set(port, socket);
            this.handleConnection('client', socket);
        });

        socket.on('error', (err) => {
            console.log(`[node ${this.port} | client] connection failed with ${err}`);

            if (!this.openConnections.get(port)) {
                console.log(`[node ${this.port} | client] reconnecting to PORT ${port}...`);
                setTimeout(() => {
                    this.connectToPeer(port);
                }, 3000);
            } else {
                console.log(`[node ${this.port} | client] disconnected from PORT ${port}`);
                this.openConnections.delete(port);
            }
        });
    }

    public handleConnection(type: 'client' | 'server', socket: net.Socket): void {
        socket.on('data', (response) => {
            console.log(
                `[node ${this.port} | ${type}] received message ${socket.localAddress}:${socket.localPort} -> ${socket.remoteAddress}:${socket.remotePort}`,
            );

            let data = JSON.parse(response.toString());
            console.log('Content:', data);

            const responseType: TYPES = data.type;
            if (responseType === TYPES.MESSAGE) {
                console.log(data.message);
            } else {
                switch (data.queryType) {
                    case QUERY_TYPE.GET_CONNECTION_STATUS:
                        this.sendData(socket, MESSAGE_TYPE.RESPONSE_CONNECTION_STATUS);
                        break;

                    case QUERY_TYPE.GET_GLOBAL_STATE:
                        this.sendData(socket, MESSAGE_TYPE.RESPONSE_GLOBAL_STATE);
                        break;

                    case QUERY_TYPE.GET_LATEST_BLOCK:
                        this.sendData(socket, MESSAGE_TYPE.RESPONSE_LATEST_BLOCK);
                        break;
                }
            }
        });

        socket.on('close', () => {
            console.log(
                `[node ${this.port} | ${type}] connection closed with ${socket.remoteAddress}:${socket.remotePort}`,
            );
        });
    }

    sendData(socket: net.Socket, type: MESSAGE_TYPE) {
        let data: { type: TYPES; messageType?: MESSAGE_TYPE; message?: string } = {
            type: TYPES.MESSAGE,
        };

        switch (type) {
            case MESSAGE_TYPE.BROADCAST_HELLO:
                data.messageType = MESSAGE_TYPE.BROADCAST_HELLO;
                data.message = `Hello from peer ${this.port} aka ${socket.localPort}`;
                break;

            case MESSAGE_TYPE.BROADCAST_NEW_ACCOUNT:
                data.messageType = MESSAGE_TYPE.BROADCAST_NEW_ACCOUNT;
                data.message = JSON.stringify(this.account.toJSON());
                break;

            case MESSAGE_TYPE.BROADCAST_NEW_BLOCK:
                data.messageType = MESSAGE_TYPE.BROADCAST_NEW_BLOCK;
                data.message = JSON.stringify('new block');
                break;

            case MESSAGE_TYPE.RESPONSE_CONNECTION_STATUS:
                data.messageType = MESSAGE_TYPE.RESPONSE_CONNECTION_STATUS;
                data.message = `Connection ${socket.localAddress}:${socket.localPort} -> ${socket.remoteAddress}:${socket.remotePort} is open`;
                break;

            case MESSAGE_TYPE.RESPONSE_GLOBAL_STATE:
                data.messageType = MESSAGE_TYPE.RESPONSE_GLOBAL_STATE;
                data.message = JSON.stringify(globalStateStore.toJSON());
                break;

            case MESSAGE_TYPE.RESPONSE_LATEST_BLOCK:
                data.messageType = MESSAGE_TYPE.RESPONSE_LATEST_BLOCK;
                data.message = JSON.stringify('latest block');
                break;
        }

        socket.write(JSON.stringify(data));

        console.log(
            `[node ${this.port} | client] sent data ${socket.localAddress}:${socket.localPort} -> ${socket.remoteAddress}:${socket.remotePort}`,
        );
    }

    queryData(socket: net.Socket, type: QUERY_TYPE) {
        let data = { type: TYPES.QUERY, queryType: type };
        socket.write(JSON.stringify(data));

        console.log(
            `[node ${this.port} | client] requested data ${socket.localAddress}:${socket.localPort} -> ${socket.remoteAddress}:${socket.remotePort}`,
        );
    }

    getAccount() {
        console.log(this.account.toJSON());
    }

    getConnections() {
        console.log('client connections:');
        [...this.openConnections.values()].map((socket) =>
            console.log(
                `${socket.localAddress}:${socket.localPort} -> ${socket.remoteAddress}:${socket.remotePort}`,
            ),
        );
    }

    broadcast() {
        for (const socket of this.openConnections.values()) {
            this.sendData(socket, MESSAGE_TYPE.BROADCAST_HELLO);
        }
    }

    checkConnecion() {
        for (let i = 0; i < TEMP__NUM_NODES; i++) {
            const port = START_PORT + i;
            const socket = this.openConnections.get(port);
            if (port !== this.port && socket) {
                this.queryData(socket, QUERY_TYPE.GET_CONNECTION_STATUS);
                break;
            }
        }
    }
}
