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

process.stdin.on('data', (data) => {
    const input = data.toString().trim();
    const command = input.split(' ');

    switch (command[0]) {
        case 'id':
            node.printID();
            break;

        case 'list':
            node.printConnections();
            break;

        case 'pub':
            node.publish(parseInt(command[1]));
            break;

        case 'quit':
            console.info('dropping server and disconnecting clients');
            process.exit(0);

        default:
            console.error(`Invalid command: ${command}`);
    }
});
