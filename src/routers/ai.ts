import { router, protectedProcedure } from '../trpc';
import { z } from 'zod';
import { generateEndpointDocs } from '../services/aiService';

export const aiRouter = router({
    generateDocs: protectedProcedure
        .input(z.object({
            method: z.string(),
            url: z.string(),
            body: z.any().optional(),
            response: z.any().optional(),
            userCommand: z.string().optional(),
        }))
        .mutation(async ({ input }) => {
            return await generateEndpointDocs(
                input.method,
                input.url,
                input.body,
                input.response,
                input.userCommand
            );
        }),
});
