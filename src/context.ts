import { inferAsyncReturnType } from '@trpc/server';
import { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import { verifyJwt, UserPayload } from './utils/jwt';

export const createContext = ({ req, res }: CreateExpressContextOptions) => {
    const token = req.headers.authorization?.split(' ')[1];
    let user: UserPayload | null = null;

    if (token) {
        const decoded = verifyJwt(token);
        if (decoded) {
            user = decoded; // Type this properly if needed
        }
    }

    return {
        req,
        res,
        user,
    };
};

export type Context = inferAsyncReturnType<typeof createContext>;
