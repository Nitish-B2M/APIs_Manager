import { query } from '../utils/db';
import { log } from '../utils/logger';

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'INVITE' | 'RESTORE';
export type EntityType = 'REQUEST' | 'FOLDER' | 'ENVIRONMENT' | 'COLLECTION' | 'SETTINGS';

export interface AuditEntry {
    documentationId: string;
    userId: string;
    action: AuditAction;
    entityType: EntityType;
    entityName?: string;
    changes?: any;
}

export const auditService = {
    async log(entry: AuditEntry) {
        try {
            await query(
                `INSERT INTO audit_logs ("documentationId", "userId", action, "entityType", "entityName", changes) 
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                    entry.documentationId,
                    entry.userId,
                    entry.action,
                    entry.entityType,
                    entry.entityName || null,
                    entry.changes ? JSON.stringify(entry.changes) : null
                ]
            );
        } catch (err: any) {
            log('error', '[AuditService] Failed to save audit log', err.message);
        }
    },

    async getLogs(documentationId: string, limit: number = 50) {
        const { rows } = await query(
            `SELECT a.*, u.name as "userName", u.email as "userEmail"
             FROM audit_logs a
             LEFT JOIN users u ON a."userId" = u.id
             WHERE a."documentationId" = $1
             ORDER BY a."createdAt" DESC
             LIMIT $2`,
            [documentationId, limit]
        );
        return rows;
    }
};
