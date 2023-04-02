import KademliaTable from './KademliaTable';
import Node, { PUBLICATION_TYPE } from './Node';
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
    const command = input.split(' ');

    switch (command[0]) {
        case 'state':
            console.log(globalStateStore.toJSON());
            node.printPool();
            break;

        case 'id':
            node.printID();
            break;

        case 'list':
            node.printConnections();
            break;

        case 'tx':
            node.makeTransaction(command[1], command[2]);
            break;

        case 'ping':
            node.publish(PUBLICATION_TYPE.PUB_PING, 'PING');
            break;

        case 'mine':
            node.mineBlock();
            break;

        case 'sync':
            node.publish(PUBLICATION_TYPE.PUB_SYNC, globalStateStore.toJSON());
            break;

        case 'quit':
            console.info('dropping server and disconnecting clients');
            process.exit(0);

        default:
            console.error(`Invalid command: ${command}`);
    }
});
