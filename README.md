# Postman Documentation Generator - Server

Backend API for the Postman Documentation Generator built with Express.js and PostgreSQL.

![Express](https://img.shields.io/badge/Express-4.21.2?style=for-the-badge&logo=express)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14+-blue?style=for-the-badge&logo=postgresql)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=for-the-badge&logo=typescript)
![Node.js](https://img.shields.io/badge/Node.js-20-green?style=for-the-badge&logo=node.js)

---

## ✨ Features

- RESTful API with Express.js
- PostgreSQL database with full-text search support
- JWT-based authentication
- Google Gemini AI integration for documentation generation
- Request/Response history tracking
- Collection management
- Environment variables support

---

## 🛠️ Tech Stack

| Category | Technology |
|----------|------------|
| Runtime | Node.js 20 |
| Framework | Express.js 4.21.2 |
| Database | PostgreSQL 14+ |
| ORM | pg (native driver) |
| Authentication | JWT + bcryptjs |
| Validation | Zod |
| AI | Google Gemini AI |
| Language | TypeScript 5 |

---

## 📦 Dependencies

### Production Dependencies

```json
{
  "@google/generative-ai": "^0.24.1",
  "bcryptjs": "^3.0.3",
  "cors": "^2.8.5",
  "dotenv": "^17.2.3",
  "express": "^4.21.2",
  "jsonwebtoken": "^9.0.3",
  "pg": "^8.17.2",
  "zod": "^3.24.1"
}
```

### Development Dependencies

```json
{
  "@types/bcryptjs": "^2.4.6",
  "@types/cors": "^2.8.19",
  "@types/dotenv": "^6.1.1",
  "@types/express": "^5.0.6",
  "@types/jsonwebtoken": "^9.0.10",
  "@types/node": "^25.0.9",
  "@types/pg": "^8.16.0",
  "nodemon": "^3.1.11",
  "ts-node": "^10.9.2",
  "typescript": "^5.9.3"
}
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js 20+
- npm or yarn
- PostgreSQL 14+ running

### Local Development

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Edit .env with your database credentials
# Example:
# DATABASE_URL=postgresql://user:password@localhost:5432/postman_docs
# JWT_SECRET=your-secret-key

# Initialize database
npm run db:init

# Start development server
npm run dev
```

The server will be available at `http://localhost:4001`

### Environment Variables

```env
# Database Connection
DATABASE_URL=postgresql://user:password@localhost:5432/postman_docs

# Server Configuration
PORT=4000
ALLOWED_ORIGIN=http://localhost:3000

# Authentication
JWT_SECRET=your-super-secret-jwt-key-change-in-production

# AI Integration (Optional)
GEMINI_API_KEY=your-gemini-api-key-for-ai-docs
```

---

## 🐳 Docker Setup

### Using Docker

```bash
# Build the image
docker build -t postman-docs-server .

# Run the container
docker run -p 4000:4000 postman-docs-server
```

### Docker Compose

From the root directory, use the main docker-compose.yml:

```bash
docker-compose up -d server
```

### Dockerfile

```dockerfile
# Use Node.js Alpine image
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy TypeScript source
COPY . .

# Compile TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs

# Copy built files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

# Set ownership
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 4000

# Start the application
CMD ["node", "dist/index.js"]
```

---

## 📁 Project Structure

```
server/
├── src/
│   ├── index.ts            # Application entry point
│   ├── routes/             # API route handlers
│   │   ├── auth.ts         # Authentication routes
│   │   ├── documentation.ts # Documentation CRUD
│   │   └── ai.ts           # AI features
│   ├── services/           # Business logic
│   │   ├── parser.ts       # Postman collection parser
│   │   ├── markdownGenerator.ts
│   │   └── aiService.ts    # Gemini AI integration
│   ├── middleware/         # Express middleware
│   │   └── auth.ts         # JWT authentication
│   ├── utils/              # Utility functions
│   │   ├── db.ts           # Database connection
│   │   └── jwt.ts          # JWT utilities
│   ├── db/                 # Database files
│   │   ├── schema.sql      # Database schema
│   │   └── migration.sql   # Migration scripts
│   └── scripts/            # Utility scripts
│       └── migrate.ts
├── .env                    # Environment variables
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🗄️ Database Schema

### Users Table

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### Documentation Table

```sql
CREATE TABLE documentation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    content TEXT,
    layout TEXT DEFAULT 'STANDARD',
    "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "isPublic" BOOLEAN DEFAULT FALSE,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### Requests Table

```sql
CREATE TABLE requests (
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
```

---

## 📡 API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login user |
| GET | `/api/auth/me` | Get current user |

### Documentation

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/documentation/list` | List user's collections |
| GET | `/api/documentation/:id` | Get collection details |
| POST | `/api/documentation/create` | Create new collection |
| POST | `/api/documentation/create-empty` | Create empty collection |
| POST | `/api/documentation/:id/request` | Add request to collection |
| PATCH | `/api/documentation/:id` | Update collection |
| PATCH | `/api/documentation/request/:id` | Update request |
| DELETE | `/api/documentation/:id` | Delete collection |
| PATCH | `/api/documentation/:id/toggle-public` | Toggle public/private |

### AI

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/ai/generate-docs` | Generate documentation |

---

## 🧪 Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Compile TypeScript |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run db:init` | Initialize database |

---

## 🔒 Security Notes

- Change `JWT_SECRET` in production
- Use strong passwords
- Enable HTTPS in production
- Set `ALLOWED_ORIGIN` to your frontend URL
- Never commit `.env` files to version control

---

## 📝 License

See the [main README](../README.md) for license information.
