import { Router, Response } from 'express';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { query } from '../utils/db';
import { z } from 'zod';
import { ApiResponse } from '../utils/response';
import { logErrorReport } from '../utils/logger';
import { ERROR_CODES } from '../constants/errorCodes';
import { checkAccess, canAdmin } from '../utils/rbac';
import crypto from 'crypto';
import { sendEmail, parseTemplate } from '../utils/email';
import { catchAsync } from '../utils/catchAsync';

const SERVICE_NAME = 'CollaborationService';
const router = Router();

// Presence tracking
const presenceConnections = new Map<string, Set<Response>>();
const presenceUsers = new Map<string, Map<string, any>>();

function broadcastPresence(documentationId: string) {
    const connections = presenceConnections.get(documentationId);
    const users = Array.from(presenceUsers.get(documentationId)?.values() || []);

    if (connections) {
        const data = `data: ${JSON.stringify(users)}\n\n`;
        connections.forEach(conn => {
            try {
                conn.write(data);
            } catch (err) {
                console.error('[Presence] Failed to write to connection:', err);
            }
        });
    }
}

// Presence SSE endpoint
router.get('/presence/:documentationId', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const documentationId = req.params.documentationId as string;
        const userId = req.user!.userId;

        // Check access
        const access = await checkAccess(documentationId, userId);
        if (!access.hasAccess) {
            res.status(403).json(ApiResponse.error({ message: 'Forbidden' }));
            return;
        }

        // PERFORMANCE GUARD: Check if document is shared or public
        const { rows: docStatus } = await query(
            `SELECT d."isPublic", 
                    (SELECT COUNT(*) FROM documentation_collaborators WHERE "documentationId" = d.id) as collaborators_count
             FROM documentation d 
             WHERE d.id = $1`,
            [documentationId]
        );

        const isShared = docStatus[0]?.isPublic || parseInt(docStatus[0]?.collaborators_count || '0') > 0;
        
        if (!isShared) {
            // If not shared, we don't need a presence connection. 
            // Just close it immediately without error to save resources.
            res.end();
            return;
        }

        // Set headers for SSE
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        // Fetch user details
        const { rows: userRows } = await query('SELECT id, name, email, avatar_url FROM users WHERE id = $1', [userId]);
        if (userRows.length === 0) {
            res.end();
            return;
        }

        const user = {
            id: userRows[0].id,
            name: userRows[0].name || userRows[0].email.split('@')[0],
            avatarUrl: userRows[0].avatar_url,
            email: userRows[0].email
        };

        // Add to presence
        if (!presenceConnections.has(documentationId)) {
            presenceConnections.set(documentationId, new Set());
            presenceUsers.set(documentationId, new Map());
        }

        presenceConnections.get(documentationId)!.add(res);
        
        // Use a counter or specific connection ID if the same user opens multiple tabs
        const userConnections = presenceUsers.get(documentationId)!;
        const currentCount = (userConnections.get(userId)?.count || 0) + 1;
        userConnections.set(userId, { ...user, count: currentCount });

        // Initial broadcast
        broadcastPresence(documentationId);

        // Keep-alive heartbeat
        const heartbeat = setInterval(() => {
            res.write(': heartbeat\n\n');
        }, 30000);

        // Remove on disconnect
        req.on('close', () => {
            clearInterval(heartbeat);
            presenceConnections.get(documentationId)?.delete(res);
            
            const userState = presenceUsers.get(documentationId)?.get(userId);
            if (userState) {
                if (userState.count <= 1) {
                    presenceUsers.get(documentationId)?.delete(userId);
                } else {
                    presenceUsers.get(documentationId)?.set(userId, { ...userState, count: userState.count - 1 });
                }
            }
            
            broadcastPresence(documentationId);
            
            // Clean up empty rooms
            if (presenceConnections.get(documentationId)?.size === 0) {
                presenceConnections.delete(documentationId);
                presenceUsers.delete(documentationId);
            }
        });
    } catch (error: any) {
        logErrorReport('presence', SERVICE_NAME, error, ERROR_CODES.COLLAB_FETCH_FAILED);
        res.end();
    }
}));

// Presence update endpoint
router.post('/presence/:documentationId/update', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const documentationId = req.params.documentationId as string;
        const userId = req.user!.userId;
        const { metadata } = req.body; // { field: 'url', requestId: '...' }

        if (!presenceUsers.has(documentationId)) {
            res.status(404).json(ApiResponse.error({ message: 'No active session' }));
            return;
        }

        const userState = presenceUsers.get(documentationId)!.get(userId);
        if (userState) {
            presenceUsers.get(documentationId)!.set(userId, { ...userState, metadata });
            broadcastPresence(documentationId);
        }

        res.json(ApiResponse.success({ message: 'Presence updated' }));
    } catch (error: any) {
        res.status(500).json(ApiResponse.error({ message: error.message }));
    }
}));

// List invitations for the current user
router.get('/my-invitations', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const { rows: userRows } = await query('SELECT email FROM users WHERE id = $1', [req.user!.userId]);
        const email = userRows[0].email;

        const { rows: invitations } = await query(
            `SELECT i.id, i.role, i."createdAt", i."expiresAt", i.token, d.title as "documentationTitle", u.name as "invitedByName"
             FROM invitations i
             JOIN documentation d ON i."documentationId" = d.id
             JOIN users u ON i."invitedBy" = u.id
             WHERE i.email = $1 AND i."expiresAt" > NOW()`,
            [email]
        );

        res.json(ApiResponse.success({
            message: 'Invitations fetched',
            data: invitations
        }));
    } catch (error: any) {
        logErrorReport('listMyInvitations', SERVICE_NAME, error, ERROR_CODES.COLLAB_FETCH_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to fetch invitations' }));
    }
}));

// Send an invitation
router.post('/invite', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const schema = z.object({
            email: z.string().email(),
            documentationId: z.string().uuid(),
            role: z.enum(['VIEWER', 'EDITOR', 'ADMIN']).default('VIEWER')
        });

        const { email, documentationId, role } = schema.parse(req.body);

        // Check if current user has ADMIN/OWNER access
        const access = await checkAccess(documentationId, req.user!.userId);
        if (!access.hasAccess || !canAdmin(access.role)) {
            res.status(403).json(ApiResponse.error({ message: 'Forbidden: Admin access required to invite collaborators' }));
            return;
        }

        // Check if user is already a collaborator
        const { rows: existingCollab } = await query(
            `SELECT c.* FROM documentation_collaborators c 
             JOIN users u ON c."userId" = u.id 
             WHERE c."documentationId" = $1 AND u.email = $2`,
            [documentationId, email]
        );

        if (existingCollab.length > 0) {
            res.status(409).json(ApiResponse.error({ message: 'User is already a collaborator' }));
            return;
        }

        // Create invitation
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000); // 7 days

        await query(
            `INSERT INTO invitations (email, "documentationId", role, token, "invitedBy", "expiresAt") 
             VALUES ($1, $2, $3, $4, $5, $6) 
             ON CONFLICT (email, "documentationId") DO UPDATE 
             SET role = EXCLUDED.role, token = EXCLUDED.token, "expiresAt" = EXCLUDED."expiresAt", "invitedBy" = EXCLUDED."invitedBy"`,
            [email, documentationId, role, token, req.user!.userId, expiresAt]
        );

        // Fetch the default invite template
        const { rows: templateRows } = await query(
            'SELECT id, subject, body FROM email_templates WHERE purpose = $1 AND "isActive" = TRUE ORDER BY "isDefault" DESC LIMIT 1',
            ['COLLABORATION_INVITE']
        );

        const template = templateRows[0];
        const inviteLink = `${process.env.ALLOWED_ORIGIN || 'http://localhost:3000'}/dashboard?token=${token}`;
        const { rows: docRows } = await query('SELECT title FROM documentation WHERE id = $1', [documentationId]);
        const docTitle = docRows[0]?.title || 'A Documentation Collection';
        const { rows: inviterRows } = await query('SELECT name FROM users WHERE id = $1', [req.user!.userId]);
        const inviterName = inviterRows[0]?.name || 'Someone';

        const vars = { docTitle, inviterName, role, inviteLink };

        let subject, body;
        if (template) {
            subject = parseTemplate(template.subject, vars);
            body = parseTemplate(template.body, vars);
        } else {
            subject = `Invitation to collaborate on ${docTitle}`;
            body = `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
                <h2 style="color: #4f46e5;">Collaboration Invite</h2>
                <p>Hello,</p>
                <p><strong>${inviterName}</strong> has invited you to collaborate on <strong>${docTitle}</strong> as an <strong>${role}</strong>.</p>
                <div style="margin: 30px 0;">
                    <a href="${inviteLink}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Accept Invitation</a>
                </div>
                <p style="color: #666; font-size: 12px;">This invitation will expire in 7 days.</p>
                <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
                <p style="color: #999; font-size: 11px;">If you don't have an account, you will be prompted to create one when you click the link.</p>
            </div>
            `;
        }

        try {
            await sendEmail(email, subject, body);

            // Log the email
            await query(
                `INSERT INTO email_logs ("templateId", "recipientEmail", "documentationId", status) 
                 VALUES ($1, $2, $3, $4)`,
                [template?.id || null, email, documentationId, 'SENT']
            );
        } catch (emailError: any) {
            await query(
                `INSERT INTO email_logs ("templateId", "recipientEmail", "documentationId", status, error) 
                 VALUES ($1, $2, $3, $4, $5)`,
                [template?.id || null, email, documentationId, 'FAILED', emailError.message]
            );
            throw emailError;
        }

        res.json(ApiResponse.success({
            message: 'Invitation sent successfully',
            data: { email, role }
        }));
    } catch (error: any) {
        logErrorReport('inviteUser', SERVICE_NAME, error, ERROR_CODES.COLLAB_INVITE_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to send invitation' }));
    }
}));

// List collaborators for a documentation
router.get('/:documentationId/collaborators', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const documentationId = req.params.documentationId as string;
        const access = await checkAccess(documentationId, req.user!.userId);
        if (!access.hasAccess) {
            res.status(403).json(ApiResponse.error({ message: 'Forbidden' }));
            return;
        }

        const { rows: collaborators } = await query(
            `SELECT c.id, c.role, c."createdAt", u.email, u.name, u.avatar_url as "avatarUrl"
             FROM documentation_collaborators c
             JOIN users u ON c."userId" = u.id
             WHERE c."documentationId" = $1
             ORDER BY c."createdAt" ASC`,
            [documentationId]
        );

        const { rows: invitations } = await query(
            `SELECT id, email, role, "createdAt", "expiresAt"
             FROM invitations
             WHERE "documentationId" = $1 AND "expiresAt" > NOW()`,
            [documentationId]
        );

        res.json(ApiResponse.success({
            message: 'Collaborators fetched',
            data: { collaborators, invitations }
        }));
    } catch (error: any) {
        logErrorReport('listCollaborators', SERVICE_NAME, error, ERROR_CODES.COLLAB_FETCH_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to fetch collaborators' }));
    }
}));

// Accept an invitation
router.post('/accept', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const { token } = req.body;
        if (!token) {
            res.status(400).json(ApiResponse.error({ message: 'Token is required' }));
            return;
        }

        const { rows: invitations } = await query(
            'SELECT * FROM invitations WHERE token = $1 AND "expiresAt" > NOW()',
            [token]
        );

        const invite = invitations[0];
        if (!invite) {
            res.status(404).json(ApiResponse.error({ message: 'Invalid or expired invitation' }));
            return;
        }

        // Check if email matches current user
        const { rows: userRows } = await query('SELECT email FROM users WHERE id = $1', [req.user!.userId]);
        if (userRows[0].email !== invite.email) {
            res.status(403).json(ApiResponse.error({ message: 'This invitation belongs to a different email address' }));
            return;
        }

        await query('BEGIN');
        try {
            // Add as collaborator
            await query(
                'INSERT INTO documentation_collaborators ("documentationId", "userId", role) VALUES ($1, $2, $3)',
                [invite.documentationId, req.user!.userId, invite.role]
            );

            // Delete invitation
            await query('DELETE FROM invitations WHERE id = $1', [invite.id]);

            // Mark email log as accepted
            await query(
                `UPDATE email_logs SET status = 'ACCEPTED', "acceptedAt" = NOW() 
                 WHERE "recipientEmail" = $1 AND "documentationId" = $2 AND status = 'SENT'`,
                [invite.email, invite.documentationId]
            );

            await query('COMMIT');
            res.json(ApiResponse.success({ message: 'Invitation accepted successfully' }));
        } catch (error) {
            await query('ROLLBACK');
            throw error;
        }
    } catch (error: any) {
        logErrorReport('acceptInvite', SERVICE_NAME, error, ERROR_CODES.COLLAB_ACCEPT_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to accept invitation' }));
    }
}));

// Remove a collaborator
router.delete('/collaborators/:id', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;

        const { rows: collabs } = await query(
            'SELECT "documentationId", "userId" FROM documentation_collaborators WHERE id = $1',
            [id]
        );

        if (!collabs[0]) {
            res.status(404).json(ApiResponse.error({ message: 'Collaborator not found' }));
            return;
        }

        const access = await checkAccess(collabs[0].documentationId, req.user!.userId);
        if (!access.hasAccess || !canAdmin(access.role)) {
            res.status(403).json(ApiResponse.error({ message: 'Forbidden: Admin access required' }));
            return;
        }

        await query('DELETE FROM documentation_collaborators WHERE id = $1', [id]);
        res.json(ApiResponse.success({ message: 'Collaborator removed' }));
    } catch (error: any) {
        logErrorReport('removeCollaborator', SERVICE_NAME, error, ERROR_CODES.COLLAB_REMOVE_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to remove collaborator' }));
    }
}));

// Update collaborator role
router.patch('/collaborators/:id', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const schema = z.object({
            role: z.enum(['VIEWER', 'EDITOR', 'ADMIN'])
        });
        const { role } = schema.parse(req.body);

        const { rows: collabs } = await query(
            'SELECT "documentationId", "userId" FROM documentation_collaborators WHERE id = $1',
            [id]
        );

        if (!collabs[0]) {
            res.status(404).json(ApiResponse.error({ message: 'Collaborator not found' }));
            return;
        }

        const access = await checkAccess(collabs[0].documentationId, req.user!.userId);
        if (!access.hasAccess || !canAdmin(access.role)) {
            res.status(403).json(ApiResponse.error({ message: 'Forbidden: Admin access required' }));
            return;
        }

        await query('UPDATE documentation_collaborators SET role = $1, "updatedAt" = NOW() WHERE id = $2', [role, id]);
        res.json(ApiResponse.success({ message: 'Collaborator role updated' }));
    } catch (error: any) {
        logErrorReport('updateCollaboratorRole', SERVICE_NAME, error, ERROR_CODES.COLLAB_UPDATE_ROLE_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to update collaborator role' }));
    }
}));

// Cancel invitation
router.delete('/invitations/:id', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { rows: invites } = await query('SELECT "documentationId" FROM invitations WHERE id = $1', [id]);

        if (!invites[0]) {
            res.status(404).json(ApiResponse.error({ message: 'Invitation not found' }));
            return;
        }

        const access = await checkAccess(invites[0].documentationId, req.user!.userId);
        if (!access.hasAccess || !canAdmin(access.role)) {
            res.status(403).json(ApiResponse.error({ message: 'Forbidden: Admin access required' }));
            return;
        }

        await query('DELETE FROM invitations WHERE id = $1', [id]);
        res.json(ApiResponse.success({ message: 'Invitation cancelled' }));
    } catch (error: any) {
        logErrorReport('cancelInvitation', SERVICE_NAME, error, ERROR_CODES.COLLAB_CANCEL_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to cancel invitation' }));
    }
}));

export default router;
