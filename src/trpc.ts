import { initTRPC, TRPCError } from '@trpc/server';
import { Context } from './context';
import { OpenApiMeta } from 'trpc-openapi';

const t = initTRPC.context<Context>().meta<OpenApiMeta>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
    if (!ctx.user) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
    }
    return next({
        ctx: {
            ...ctx,
            user: ctx.user,
        },
    });
});
