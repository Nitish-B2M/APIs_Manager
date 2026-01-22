import { router } from '../trpc';
import { authRouter } from './auth';
import { documentationRouter } from './documentation';
import { aiRouter } from './ai';

export const appRouter = router({
    auth: authRouter,
    documentation: documentationRouter,
    ai: aiRouter
});

export type AppRouter = typeof appRouter;
