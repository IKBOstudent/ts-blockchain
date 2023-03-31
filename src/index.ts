import KademliaTable from './KademliaTable';
import Node from './Node';
import StateStore from './StateStore';
import colors from 'colors';

colors.enable();

export const globalStateStore = new StateStore();

if (process.argv.length < 3) {
    console.log('no port provided');
    process.exit(1);
}

const node = new Node(parseInt(process.argv[2]));
node.initServer();
node.joinNetwork();

process.stdin.on('data', (data) => {
    const input = data.toString().trim();
    const command = input.split(' ')[0];
    const args1 = input.split(' ')[1];

    switch (command) {
        case 'ping':
            node.ping(parseInt(args1));
            break;

        case 'pingall':
            node.broadcastPing();
            break;

        case 'list':
            node.getConnections();
            break;

        case 'quit':
            console.info('dropping server and disconnecting clients');
            process.exit(0);

        default:
            console.error(`Invalid command: ${command}`);
    }
});
