import * as net from "net";
import { globalStateStore } from ".";
import Account from "./Account";
import Blockchain from "./Blockchain";

const TEMP__NUM_NODES = 2;
const START_PORT = 3001;

enum MESSAGE_TYPE {
    ACCOUNT_CREATED = 0,
    BLOCK_CREATED = 1,
}

enum QUERY_TYPE {
    GET_LATEST_BLOCK = 0,
    GET_ALL_BLOCKS = 1,
}

export default class Node {
    port: number;
    peers: Map<number, net.Socket>;

    account: Account;

    constructor(port: number) {
        this.port = port;
        this.peers = new Map();

        this.account = new Account();
        globalStateStore.addAccount(this.account);
    }

    getState() {
        console.log(this.account.toJSON());
    }

    initServer() {
        const server = net.createServer(socket => {
            this.handleConnection(socket);
        });

        server.listen(this.port, () => {
            console.log(`listening on port ${this.port}`);
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
        const socket = net.createConnection({ port }, () => {
            console.log(`Connected to peer ${port}`);
            this.peers.set(port, socket);
            socket.write(`Hello from new peer ${this.port}`);
            // this.sendMessage(socket, MESSAGE_TYPE.ACCOUNT_CREATED);
            // this.handleConnection(socket);
        });

        socket.on("error", () => {
            console.log(`Connection failed to peer ${port}`);
            if (!this.peers.get(port)) {
                console.log("reconnecting...");
                setTimeout(() => {
                    this.connectToPeer(port);
                }, 3000);
            } else {
                console.log("[disconnected]");
                this.peers.delete(port);
            }
        });
    }

    public handleConnection(socket: net.Socket): void {
        socket.on("data", response => {
            let data = response.toString();
            console.log(
                `Received message from ${socket.remoteAddress}:${socket.remotePort} / ${socket.localAddress}:${socket.localPort}`
            );
            console.log("Data:", data);
        });

        socket.on("close", () => {
            console.log(
                `Connection closed with ${socket.remoteAddress}:${socket.remotePort} / ${socket.localAddress}:${socket.localPort}`
            );
        });
    }

    sendMessage(socket: net.Socket, type: MESSAGE_TYPE) {
        if (type === MESSAGE_TYPE.ACCOUNT_CREATED) {
            const data = { type: type, message: this.account.toJSON() };
            socket.write(JSON.stringify(data));
        }
        console.log(`Node ${this.port}: Sent data to peer ${socket.remoteAddress}:${socket.remotePort}`);
    }
}
