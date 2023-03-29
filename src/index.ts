import Node from './Node';
import StateStore from './StateStore';

export const globalStateStore = new StateStore();

if (process.argv.length < 3) {
    console.log('no port provided');
    process.exit(1);
}

const node = new Node(parseInt(process.argv[2]));
node.initServer();
node.initConnections();

process.stdin.on('data', (data) => {
    const input = data.toString().trim();

    if (input === 'account') {
        node.getAccount();
    } else if (input === 'list') {
        node.getConnections();
    } else if (input === 'broadcast') {
        node.broadcast();
    } else if (input === 'check connection') {
        node.checkConnecion();
    } else if (input === 'quit') {
        console.log('dropping server and disconnecting clients');
        process.exit(0);
    } else {
        console.log(`Invalid command: ${input}`);
    }
});
