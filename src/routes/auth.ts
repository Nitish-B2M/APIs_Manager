import { Router, Response, Request } from 'express';
import { query } from '../utils/db';
import { signJwt } from '../utils/jwt';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { AuthRequest, authMiddleware } from '../middleware/auth';

const router = Router();

router.post('/register', async (req: Request, res: Response) => {
    try {
        const schema = z.object({ email: z.string().email(), password: z.string().min(6) });
        const { email, password } = schema.parse(req.body);

        const { rows: existingUsers } = await query('SELECT * FROM users WHERE email = $1', [email]);
        if (existingUsers.length > 0) {
            res.status(409).json({ status: false, message: 'User already exists', error: 'Conflict' });
            return;
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const { rows } = await query(
            'INSERT INTO users (email, password) VALUES ($1, $2) RETURNING *',
            [email, hashedPassword]
        );
        const user = rows[0];

        const token = signJwt({ userId: user.id });
        res.json({
            status: true,
            message: 'User registered successfully',
            data: { token, user: { id: user.id, email: user.email } },
            pagination: null
        });
    } catch (error: any) {
        res.status(400).json({ status: false, message: 'Registration failed', error: error.message });
    }
});

router.post('/login', async (req: Request, res: Response) => {
    try {
        const schema = z.object({ email: z.string().email(), password: z.string() });
        const { email, password } = schema.parse(req.body);

        const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
        const user = rows[0];

        if (!user) {
            res.status(401).json({ status: false, message: 'Invalid credentials', error: 'Unauthorized' });
            return;
        }

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            res.status(401).json({ status: false, message: 'Invalid credentials', error: 'Unauthorized' });
            return;
        }

        const token = signJwt({ userId: user.id });
        res.json({
            status: true,
            message: 'Login successful',
            data: { token, user: { id: user.id, email: user.email } },
            pagination: null
        });
    } catch (error: any) {
        res.status(400).json({ status: false, message: 'Login failed', error: error.message });
    }
});

router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user?.userId) {
            res.status(401).json({ status: false, message: 'Unauthorized' });
            return;
        }

        const { rows } = await query('SELECT id, email, "createdAt" FROM users WHERE id = $1', [req.user.userId]);
        
        if (rows.length === 0) {
            res.status(404).json({ status: false, message: 'User not found' });
            return;
        }

        res.json({
            status: true,
            message: 'Profile fetched',
            data: { id: rows[0].id, email: rows[0].email },
            pagination: null
        });
    } catch (error: any) {
        console.error('Error fetching profile:', error);
        res.status(500).json({ status: false, message: 'Failed to fetch profile', error: error.message });
    }
});


export default router;
