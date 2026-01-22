import express from 'express';
import cors from 'cors';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { appRouter } from './routers/app';
import { createContext } from './context';

const app = express();
export { app };
const PORT = process.env.PORT || 4000;

app.use(cors({
    origin: process.env.ALLOWED_ORIGIN || 'http://localhost:3000',
    credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use(
    '/trpc',
    createExpressMiddleware({
        router: appRouter,
        createContext,
    })
);

app.get('/', (req, res) => {
    console.log('Hello World', req.headers);
    res.send('Postman Documentation Generator API');
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
