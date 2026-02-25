import { query } from './db';

export type UserRole = 'VIEWER' | 'EDITOR' | 'ADMIN';

export async function checkAccess(documentationId: string, userId: string): Promise<{ hasAccess: boolean, role: UserRole | 'OWNER', isPublic: boolean }> {
    // Check if user is the direct owner or documentation is public
    const docRes = await query(
        `SELECT "userId", "isPublic" FROM documentation WHERE id = $1`,
        [documentationId]
    );

    if (docRes.rows.length === 0) {
        return { hasAccess: false, role: 'VIEWER', isPublic: false };
    }

    const doc = docRes.rows[0];

    // Owner has full access
    if (doc.userId === userId) {
        return { hasAccess: true, role: 'OWNER', isPublic: doc.isPublic };
    }

    // If not owner, check collaborators table
    const collabRes = await query(
        `SELECT role FROM documentation_collaborators WHERE "documentationId" = $1 AND "userId" = $2`,
        [documentationId, userId]
    );

    if (collabRes.rows.length > 0) {
        return { hasAccess: true, role: collabRes.rows[0].role as UserRole, isPublic: doc.isPublic };
    }

    // If no explicit access but public, grant viewer access
    if (doc.isPublic) {
        return { hasAccess: true, role: 'VIEWER', isPublic: true };
    }

    return { hasAccess: false, role: 'VIEWER', isPublic: false };
}

export function canEdit(role: UserRole | 'OWNER'): boolean {
    return ['OWNER', 'ADMIN', 'EDITOR'].includes(role);
}

export function canAdmin(role: UserRole | 'OWNER'): boolean {
    return ['OWNER', 'ADMIN'].includes(role);
}
