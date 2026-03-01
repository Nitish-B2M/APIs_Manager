import { query } from '../utils/db';

export interface Contact {
    id: string;
    name: string;
    email: string;
    message: string;
    status: 'NEW' | 'IN_PROGRESS' | 'RESOLVED';
    createdAt: Date;
    updatedAt: Date;
}

export class ContactModel {
    static async create(data: { name: string; email: string; message: string }): Promise<Contact> {
        const result = await query(
            `INSERT INTO contacts (name, email, message) 
             VALUES ($1, $2, $3) 
             RETURNING *`,
            [data.name, data.email, data.message]
        );
        return result.rows[0];
    }

    static async findAll(status?: string): Promise<Contact[]> {
        if (status) {
            const result = await query('SELECT * FROM contacts WHERE status = $1 ORDER BY "createdAt" DESC', [status]);
            return result.rows;
        }
        const result = await query('SELECT * FROM contacts ORDER BY "createdAt" DESC');
        return result.rows;
    }

    static async findById(id: string): Promise<Contact | null> {
        const result = await query('SELECT * FROM contacts WHERE id = $1', [id]);
        return result.rows[0] || null;
    }

    static async updateStatus(id: string, status: 'NEW' | 'IN_PROGRESS' | 'RESOLVED'): Promise<Contact | null> {
        const result = await query(
            `UPDATE contacts 
             SET status = $1 
             WHERE id = $2 
             RETURNING *`,
            [status, id]
        );
        return result.rows[0] || null;
    }

    static async delete(id: string): Promise<boolean> {
        const result = await query('DELETE FROM contacts WHERE id = $1 RETURNING id', [id]);
        return result.rows.length > 0;
    }
}
