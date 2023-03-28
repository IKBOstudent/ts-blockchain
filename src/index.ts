import express from 'express';
import Account from './Account';
import StateStore from './StateStore';
import Blockchain from './Blockchain';

const app = express();
app.use(express.json());

export const globalStateStore = new StateStore();

app.get('/', (req, res) => {
    res.send('running app...');
});

app.get('/state', (req, res) => {
    res.send(globalStateStore.toJSON());
});

app.get(`/nodes/:id`, (req, res) => {
    const account = globalStateStore.getAccountByAddress(req.params.id.slice(2));
    if (account) {
        res.send(account.toJSON());
    } else {
        res.send('No such account');
    }
});

app.post('/nodes', (req, res) => {
    const pers = new Account();
    globalStateStore.addAccount(pers);

    res.send(pers.toJSON());
});

const PORT = 8888;
app.listen(PORT, () => {
    console.log(`[server]: Server is running at http://localhost:${PORT}`);
});
