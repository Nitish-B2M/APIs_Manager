import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import './utils/env';
import { authLimiter, generalLimiter } from './middleware/rateLimit';
import { errorHandler, requestIdMiddleware } from './middleware/errorHandler';
import { checkDbHealth } from './utils/db';
import { generateOpenAPISpec, getSwaggerHTML } from './utils/apiDocs';
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
import githubAuthRoutes from './routes/githubAuth';
import gitManagerRoutes from './routes/gitManager';
import executeRoutes from './routes/execute';
import workspaceRoutes from './routes/workspaces';
import tagRoutes from './routes/tags';
import notificationRoutes from './routes/notifications';
import commentRoutes from './routes/comments';
import templateRoutes from './routes/templates';
import searchRoutes from './routes/search';
import { initMonitors } from './services/monitorService';
import { githubAccountMiddleware } from './middleware/githubAccount';

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
app.use(compression());
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cookieParser());
app.use(requestIdMiddleware);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// REST API routes
app.get('/api/health', async (_req, res) => {
    let db = { connected: false, latencyMs: 0, activeConnections: 0, idleConnections: 0 };
    try {
        db = await Promise.race([
            checkDbHealth(),
            new Promise<typeof db>(resolve => setTimeout(() => resolve(db), 3000)),
        ]);
    } catch { /* use default disconnected state */ }
    res.status(db.connected ? 200 : 503).json({
        status: db.connected ? 'ok' : 'degraded',
        message: db.connected ? 'Server is healthy' : 'Database connection issue',
        timestamp: new Date().toISOString(),
        env: process.env.NODE_ENV,
        database: db,
        uptime: process.uptime(),
        memory: { heapUsedMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) },
    });
});

// API Documentation (development only)
if (process.env.NODE_ENV !== 'production') {
    app.get('/api/docs', (_req, res) => { res.type('html').send(getSwaggerHTML()); });
    app.get('/api/docs/spec.json', (_req, res) => { res.json(generateOpenAPISpec()); });
}

// Request logging middleware for debugging
app.use((req, _res, next) => {
    console.log(`[Server] ${req.method} ${req.url}`);
    next();
});

app.use(githubAccountMiddleware);
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/auth/github', githubAuthRoutes);
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
app.use('/api/git', generalLimiter, gitManagerRoutes);
app.use('/api/execute', generalLimiter, executeRoutes);
app.use('/api/workspaces', generalLimiter, workspaceRoutes);
app.use('/api/tags', generalLimiter, tagRoutes);
app.use('/api/notifications', generalLimiter, notificationRoutes);
app.use('/api/comments', generalLimiter, commentRoutes);
app.use('/api/templates', generalLimiter, templateRoutes);
app.use('/api/search', generalLimiter, searchRoutes);
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

// Only start listening if not in test mode (tests use supertest directly)
if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
        initMonitors().catch(err => console.error('[Monitor] Init error:', err));
    });
}
