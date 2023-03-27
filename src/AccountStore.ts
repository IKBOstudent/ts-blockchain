import Account from "./Account";

export default class AccountStore {
    public accounts: Map<string, Account>
    constructor() {
        this.accounts = new Map();
    }

    addAccount(newAccount: Account): void {
        this.accounts.set(newAccount.address, newAccount);
    }

    getAccountByAddress(address: string): Account {
        return this.accounts.get(address);
    }
}