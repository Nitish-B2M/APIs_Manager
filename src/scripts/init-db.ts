#!/usr/bin/env ts-node
// ============================================
// Database Initialization Script
// Creates all required tables for the application
// Usage: npx ts-node src/scripts/init-db.ts
// ============================================

import { query } from '../utils/db';
import dotenv from 'dotenv';

dotenv.config({ path: __dirname + '/../../.env' });

async function initDatabase() {
    console.log('🔄 Initializing database...\n');

    try {
        // Create users table
        console.log('📦 Creating users table...');
        await query(`
            CREATE TABLE IF NOT EXISTS users (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ users table created');

        // Create documentation table
        console.log('📦 Creating documentation table...');
        await query(`
            CREATE TABLE IF NOT EXISTS documentation (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                title TEXT NOT NULL,
                content TEXT,
                layout TEXT DEFAULT 'STANDARD',
                "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                "isPublic" BOOLEAN DEFAULT FALSE,
                "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ documentation table created');

        // Create requests table
        console.log('📦 Creating requests table...');
        await query(`
            CREATE TABLE IF NOT EXISTS requests (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                "documentationId" UUID NOT NULL REFERENCES documentation(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                method TEXT NOT NULL,
                url TEXT NOT NULL,
                description TEXT,
                body JSONB,
                headers JSONB,
                params JSONB,
                "lastResponse" JSONB,
                history JSONB DEFAULT '[]'::jsonb,
                "order" INTEGER DEFAULT 0,
                "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ requests table created');

        // Create indexes for better performance
        console.log('📦 Creating indexes...');
        await query(`CREATE INDEX IF NOT EXISTS idx_documentation_user ON documentation("userId");`);
        await query(`CREATE INDEX IF NOT EXISTS idx_requests_doc ON requests("documentationId");`);
        console.log('✅ Indexes created');

        // Verify tables
        console.log('\n📋 Verifying tables...');
        const result = await query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name;
        `);
        console.log('Existing tables:', result.rows.map(r => r.table_name).join(', '));

        console.log('\n✅ Database initialization completed successfully!');
        process.exit(0);
    } catch (error: any) {
        console.error('❌ Database initialization failed:', error.message);
        process.exit(1);
    }
}

initDatabase();
