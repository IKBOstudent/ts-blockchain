import Node from "./Node";
import StateStore from "./StateStore";

export const globalStateStore = new StateStore();

const node = new Node(parseInt(process.argv[2]));
node.initServer();
if (process.argv[2] === "3002") {
    node.initConnections();
}
node.getState();
