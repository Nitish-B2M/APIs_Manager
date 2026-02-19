// Server test setup
import { vi } from 'vitest';

// Mock environment variables for testing
process.env.JWT_SECRET = 'test-secret';
process.env.PORT = '4001';

// Mock database
vi.mock('../utils/db', () => ({
    query: vi.fn(),
}));

// Global test timeout
vi.setConfig({ testTimeout: 10000 });
