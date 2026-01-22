import { router, protectedProcedure, publicProcedure } from '../trpc';
import { z } from 'zod';
import { query } from '../utils/db';
import { TRPCError } from '@trpc/server';

export const documentationRouter = router({
    list: protectedProcedure.query(async ({ ctx }) => {
        const { rows } = await query(
            'SELECT * FROM documentation WHERE "userId" = $1 ORDER BY "createdAt" DESC',
            [ctx.user.userId]
        );
        return rows;
    }),

    create: protectedProcedure
        .input(
            z.object({
                title: z.string(),
                content: z.any(), // Postman JSON structure
                layout: z.string().default('STANDARD'),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const { extractEndpoints } = await import('../services/markdownGenerator');

            let parsedContent: any;
            if (typeof input.content === 'string') {
                parsedContent = JSON.parse(input.content);
            } else {
                parsedContent = input.content;
            }

            const endpoints = extractEndpoints(parsedContent.item || []);

            const result = await query(
                'INSERT INTO documentation (title, content, layout, "userId") VALUES ($1, $2, $3, $4) RETURNING *',
                [input.title, JSON.stringify({
                    collection: parsedContent.info,
                    endpoints
                }), input.layout, ctx.user.userId]
            );
            return result.rows[0];
        }),

    createEmpty: protectedProcedure
        .input(z.object({
            title: z.string(),
            description: z.string().optional()
        }))
        .mutation(async ({ ctx, input }) => {
            const content = {
                collection: {
                    name: input.title,
                    description: input.description || ''
                },
                endpoints: []
            };

            const result = await query(
                'INSERT INTO documentation (title, content, layout, "userId") VALUES ($1, $2, $3, $4) RETURNING *',
                [input.title, JSON.stringify(content), 'STANDARD', ctx.user.userId]
            );
            return result.rows[0];
        }),

    delete: protectedProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const { rows: docs } = await query('SELECT * FROM documentation WHERE id = $1', [input.id]);
            const doc = docs[0];

            if (!doc || doc.userId !== ctx.user.userId) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Documentation not found' });
            }

            const { rows } = await query('DELETE FROM documentation WHERE id = $1 RETURNING *', [input.id]);
            return rows[0];
        }),

    update: protectedProcedure
        .input(z.object({
            id: z.string(),
            content: z.any() // Updated JSON structure
        }))
        .mutation(async ({ ctx, input }) => {
            const { rows: docs } = await query('SELECT * FROM documentation WHERE id = $1', [input.id]);
            const doc = docs[0];

            if (!doc || doc.userId !== ctx.user.userId) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Documentation not found' });
            }

            // Ensure content is stored as stringified JSON
            const contentString = typeof input.content === 'string' ? input.content : JSON.stringify(input.content);

            const { rows } = await query(
                'UPDATE documentation SET content = $2, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
                [input.id, contentString]
            );
            return rows[0];
        }),

    togglePublic: protectedProcedure
        .input(z.object({ id: z.string(), isPublic: z.boolean() }))
        .mutation(async ({ ctx, input }) => {
            const { rows: docs } = await query('SELECT * FROM documentation WHERE id = $1', [input.id]);
            const doc = docs[0];

            if (!doc || doc.userId !== ctx.user.userId) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Documentation not found' });
            }

            const { rows } = await query(
                'UPDATE documentation SET "isPublic" = $2 WHERE id = $1 RETURNING *',
                [input.id, input.isPublic]
            );
            return rows[0];
        }),

    getById: publicProcedure
        .input(z.object({ id: z.string() }))
        .query(async ({ ctx, input }) => {
            const { rows } = await query('SELECT * FROM documentation WHERE id = $1', [input.id]);
            const doc = rows[0];

            if (!doc) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Documentation not found' });
            }

            const isOwner = ctx.user && doc.userId === ctx.user.userId;

            if (!doc.isPublic && !isOwner) {
                if (!ctx.user) {
                    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'This collection is private. Please login to view it.' });
                }
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Documentation not found' });
            }

            return doc;
        }),
});
