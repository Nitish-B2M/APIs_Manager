import { Router } from 'express';
import { mockService } from '../services/mockService';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { checkAccess, canEdit } from '../utils/rbac';
import { query } from '../utils/db';
import { ApiResponse } from '../utils/response';

const router = Router();

// --- Management Routes (Authenticated) ---

// Get mock config for a request
router.get('/config/:requestId', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const requestId = req.params.requestId as string;

        const { rows: requests } = await query('SELECT "documentationId" FROM requests WHERE id = $1', [requestId]);
        if (!requests[0]) {
            res.status(404).json(ApiResponse.error({ message: 'Request not found' }));
            return;
        }

        const access = await checkAccess(requests[0].documentationId, req.user!.userId);
        if (!access.hasAccess) {
            res.status(403).json(ApiResponse.error({ message: 'Forbidden' }));
            return;
        }

        const config = await mockService.getMockResponse(requestId);
        res.json(ApiResponse.success({ message: 'Mock configuration fetched', data: config }));
    } catch (error: any) {
        res.status(500).json(ApiResponse.error({ message: error.message }));
    }
});

// Update mock config
router.post('/config', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const { requestId } = req.body;
        if (!requestId) {
            res.status(400).json(ApiResponse.error({ message: 'requestId is required' }));
            return;
        }

        const { rows: requests } = await query('SELECT "documentationId" FROM requests WHERE id = $1', [requestId]);
        if (!requests[0]) {
            res.status(404).json(ApiResponse.error({ message: 'Request not found' }));
            return;
        }

        const access = await checkAccess(requests[0].documentationId, req.user!.userId);
        if (!access.hasAccess || !canEdit(access.role)) {
            res.status(403).json(ApiResponse.error({ message: 'Forbidden: Editor access required' }));
            return;
        }

        const config = await mockService.upsertMockResponse(req.body);
        res.json(ApiResponse.success({ message: 'Mock configuration updated', data: config }));
    } catch (error: any) {
        res.status(500).json(ApiResponse.error({ message: error.message }));
    }
});

// --- Mock Server Engine (Public) ---

// Wildcard route to handle mock requests
// Format: /m/:requestId/*
router.all('/:requestId*', async (req, res) => {
    const fullParams = req.params as any;
    const requestId = fullParams.requestId;

    try {
        const mock = await mockService.getMockResponse(requestId);

        if (!mock || !mock.isActive) {
            res.status(404).json({
                error: 'Mock not found or inactive',
                requestId
            });
            return;
        }

        // Simulate delay
        if (mock.delay > 0) {
            await new Promise(resolve => setTimeout(resolve, mock.delay));
        }

        // Evaluate conditional rules
        const matchedRule = mockService.evaluateRules(mock.rules, req);
        
        if (matchedRule) {
            if (matchedRule.headers) {
                Object.entries(matchedRule.headers).forEach(([key, value]) => {
                    res.setHeader(key, String(value));
                });
            }
            res.status(matchedRule.statusCode).send(matchedRule.body);
            return;
        }

        // Apply default headers
        if (mock.headers) {
            Object.entries(mock.headers).forEach(([key, value]) => {
                res.setHeader(key, String(value));
            });
        }

        // Return status and body
        res.status(mock.statusCode).send(mock.body);
        return;
    } catch (error: any) {
        res.status(500).json({ error: 'Mock server error', message: error.message });
        return;
    }
});

export default router;
