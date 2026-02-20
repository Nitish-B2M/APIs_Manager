import express from 'express';
import cors from 'cors';
import { authLimiter } from './middleware/rateLimit';
import { errorHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth';
import documentationRoutes from './routes/documentation';
import aiRoutes from './routes/ai';
import foldersRoutes from './routes/folders';
import environmentsRoutes from './routes/environments';
import todosRoutes from './routes/todos';
import notesRoutes from './routes/notes';

const app = express();
export default app;
export { app };
const PORT = process.env.PORT || 4000;

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

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/documentation', documentationRoutes);
app.use('/api/documentation', foldersRoutes);
app.use('/api/documentation', environmentsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/todos', todosRoutes);
app.use('/api/notes', notesRoutes);

app.get('/', (req, res) => {
    console.log('Hello World', req.headers);
    res.send('Postman Documentation Generator API');
});

// Centralized error handler (must be last middleware)
app.use(errorHandler);

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
