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
export { app };
const PORT = process.env.PORT || 4000;

app.use(cors({
    origin: process.env.ALLOWED_ORIGIN || 'http://localhost:3000',
    credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// REST API routes
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
