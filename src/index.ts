import express from 'express';
import cors from 'cors';
import './utils/env';
import { authLimiter, generalLimiter } from './middleware/rateLimit';
import { errorHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth';
import documentationRoutes from './routes/documentation';
import aiRoutes from './routes/ai';
import foldersRoutes from './routes/folders';
import environmentsRoutes from './routes/environments';
import todosRoutes from './routes/todos';
import notesRoutes from './routes/notes';
import mockRoutes from './routes/mock';
import snapshotRoutes from './routes/snapshot';
import monitorRoutes from './routes/monitor';
import collaborationRoutes from './routes/collaboration';
import adminRoutes from './routes/admin';
import schedulerRoutes from './routes/scheduler';
import contactRoutes from './routes/contact';
import webhookRoutes from './routes/webhook';
import { initMonitors } from './services/monitorService';

const app = express();
export default app;
export { app };
const PORT = process.env.PORT || 4001;

app.use(cors({
    origin: (origin, callback) => {
        const envAllowed = process.env.ALLOWED_ORIGIN || '';
        const allowedOrigins = [
            'http://localhost:3000',
            'https://apis-manager-git-master-nitishb2ms-projects.vercel.app',
            ...envAllowed.split(',')
        ].map(o => o.trim()).filter(Boolean);

        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
            callback(null, true);
        } else {
            console.log('Blocked by CORS:', origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// REST API routes
app.get('/api/health', (_req, res) => {
    res.status(200).json({
        status: 'ok',
        message: 'Server is healthy',
        timestamp: new Date().toISOString(),
        env: process.env.NODE_ENV
    });
});

// Request logging middleware for debugging
app.use((req, _res, next) => {
    console.log(`[Server] ${req.method} ${req.url}`);
    next();
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/documentation', generalLimiter, documentationRoutes);
app.use('/api/documentation', generalLimiter, foldersRoutes);
app.use('/api/documentation', generalLimiter, environmentsRoutes);
app.use('/api/ai', generalLimiter, aiRoutes);
app.use('/api/todos', generalLimiter, todosRoutes);
app.use('/api/notes', generalLimiter, notesRoutes);
app.use('/api/mock', generalLimiter, mockRoutes);
app.use('/api/snapshot', generalLimiter, snapshotRoutes);
app.use('/api/monitor', generalLimiter, monitorRoutes);
app.use('/api/collaboration', generalLimiter, collaborationRoutes);
app.use('/api/admin', generalLimiter, adminRoutes);
app.use('/api/scheduler', generalLimiter, schedulerRoutes);
app.use('/api/contact', generalLimiter, contactRoutes);
app.use('/api/webhooks', generalLimiter, webhookRoutes);
app.use('/m', mockRoutes);

app.get('/', (req, res) => {
    console.log('Hello World', req.headers);
    res.send('DevManus Documentation Generator API');
});

// 404 handler
app.use((_req, res) => {
    res.status(404).json({
        status: false,
        message: 'Route not found'
    });
});

// Centralized error handler (must be last middleware)
app.use(errorHandler);

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    // Initialize monitoring cron jobs
    initMonitors().catch(err => console.error('[Monitor] Init error:', err));
});
