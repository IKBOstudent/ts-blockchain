import * as crypto from "crypto";
import MerkleTree from "merkletreejs";
import { Account } from "./Account";

export default class StateStore {
    public accounts: Map<string, Account>;
    public merkleTrie: MerkleTree;

    constructor() {
        this.accounts = new Map();
        this.merkleTrie = new MerkleTree([]);
    }

    addAccount(newAccount: Account): void {
        this.accounts.set(newAccount.address, newAccount);
        this.merkleTrie.addLeaf(crypto.createHash("sha3-256").update(newAccount.address).digest());
    }

    getMerkleRootHash(): string {
        return this.merkleTrie.getRoot().toString("hex");
    }

    getAccountByAddress(address: string): Account | undefined {
        return this.accounts.get(address);
    }

    toJSON() {
        return {
            accounts: [...Array.from(this.accounts.values()).map(val => val.toJSON())],
        };
    }
}
