import * as crypto from "crypto";
import MerkleTree from "merkletreejs";
import { Account, AccountType } from "./Account";

export default class StateStore {
    public accounts: Account[];

    constructor() {
        this.accounts = [];
    }

    syncStore(accounts: AccountType[]) {
        for (const account of accounts) {
            this.addAccount(new Account(account));
        }
    }

    addAccount(newAccount: Account): void {
        this.accounts.push(newAccount);
        this.accounts.sort((a, b) => Buffer.compare(Buffer.from(a.address, "hex"), Buffer.from(b.address, "hex")));
    }

    getMerkleRootHash(): string {
        const merkleTree = new MerkleTree(this.accounts.map(account => account.address));
        return merkleTree.getRoot().toString("hex");
    }

    getAccountByAddress(address: string): Account | undefined {
        return this.accounts.find(account => account.address === address);
    }

    toJSON(): AccountType[] {
        return this.accounts.map(val => val.toJSON());
    }
}
