import { query } from '../utils/db';

export const snapshotService = {
    async createSnapshot(documentationId: string, name: string) {
        // Fetch current collection state
        const { rows: docs } = await query('SELECT * FROM documentation WHERE id = $1', [documentationId]);
        const doc = docs[0];
        if (!doc) throw new Error('Documentation not found');

        const { rows: requests } = await query('SELECT * FROM requests WHERE "documentationId" = $1 ORDER BY "order" ASC', [documentationId]);
        const { rows: folders } = await query('SELECT * FROM folders WHERE "documentationId" = $1', [documentationId]);

        const snapshotData = {
            doc: {
                title: doc.title,
                content: doc.content,
                layout: doc.layout
            },
            requests,
            folders
        };

        const { rows } = await query(
            'INSERT INTO snapshots ("documentationId", name, data) VALUES ($1, $2, $3) RETURNING *',
            [documentationId, name, JSON.stringify(snapshotData)]
        );

        return rows[0];
    },

    async listSnapshots(documentationId: string) {
        const { rows } = await query(
            'SELECT id, name, "createdAt" FROM snapshots WHERE "documentationId" = $1 ORDER BY "createdAt" DESC',
            [documentationId]
        );
        return rows;
    },

    async restoreSnapshot(snapshotId: string) {
        const { rows: snapshots } = await query('SELECT * FROM snapshots WHERE id = $1', [snapshotId]);
        const snapshot = snapshots[0];
        if (!snapshot) throw new Error('Snapshot not found');

        const data = snapshot.data;
        const documentationId = snapshot.documentationId;

        await query('BEGIN');
        try {
            // Restore documentation meta
            await query(
                'UPDATE documentation SET title = $1, content = $2, layout = $3, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $4',
                [data.doc.title, data.doc.content, data.doc.layout, documentationId]
            );

            // Clear current requests and folders
            await query('DELETE FROM requests WHERE "documentationId" = $1', [documentationId]);
            await query('DELETE FROM folders WHERE "documentationId" = $1', [documentationId]);

            // Restore folders
            for (const folder of data.folders) {
                await query(
                    'INSERT INTO folders (id, "documentationId", name, "parentId", "order") VALUES ($1, $2, $3, $4, $5)',
                    [folder.id, documentationId, folder.name, folder.parentId, folder.order]
                );
            }

            // Restore requests
            for (const req of data.requests) {
                await query(
                    `INSERT INTO requests (id, "documentationId", name, method, protocol, url, description, body, headers, params, "lastResponse", history, "order", "folderId", assertions, auth) 
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
                    [
                        req.id, documentationId, req.name, req.method, req.protocol, req.url,
                        req.description, JSON.stringify(req.body), JSON.stringify(req.headers),
                        JSON.stringify(req.params), JSON.stringify(req.lastResponse),
                        JSON.stringify(req.history), req.order, req.folderId,
                        JSON.stringify(req.assertions || []), JSON.stringify(req.auth || {})
                    ]
                );
            }

            await query('COMMIT');
            return { message: 'Snapshot restored successfully' };
        } catch (error) {
            await query('ROLLBACK');
            throw error;
        }
    },

    async deleteSnapshot(snapshotId: string) {
        await query('DELETE FROM snapshots WHERE id = $1', [snapshotId]);
    }
};
