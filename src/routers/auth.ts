import { router, publicProcedure, protectedProcedure } from '../trpc';
import { z } from 'zod';
import { query } from '../utils/db';
import { signJwt } from '../utils/jwt';
import bcrypt from 'bcryptjs';
import { TRPCError } from '@trpc/server';

export const authRouter = router({
    register: publicProcedure
        .input(z.object({ email: z.string().email(), password: z.string().min(6) }))
        .mutation(async ({ input }) => {
            const { rows: existingUsers } = await query('SELECT * FROM users WHERE email = $1', [input.email]);
            if (existingUsers.length > 0) {
                throw new TRPCError({ code: 'CONFLICT', message: 'User already exists' });
            }

            const hashedPassword = await bcrypt.hash(input.password, 10);
            const { rows } = await query(
                'INSERT INTO users (email, password) VALUES ($1, $2) RETURNING *',
                [input.email, hashedPassword]
            );
            const user = rows[0];

            const token = signJwt({ userId: user.id, email: user.email });
            return { token, user: { id: user.id, email: user.email } };
        }),

    login: publicProcedure
        .input(z.object({ email: z.string().email(), password: z.string() }))
        .mutation(async ({ input }) => {
            const { rows } = await query('SELECT * FROM users WHERE email = $1', [input.email]);
            const user = rows[0];

            if (!user) {
                throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid credentials' });
            }

            const isValid = await bcrypt.compare(input.password, user.password);
            if (!isValid) {
                throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid credentials' });
            }

            const token = signJwt({ userId: user.id, email: user.email });
            return { token, user: { id: user.id, email: user.email } };
        }),

    me: protectedProcedure.query(async ({ ctx }) => {
        return ctx.user;
    }),
});
