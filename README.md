# AI-Powered Learning Assistant

Production-ready scaffold for a personalized learning assistant built with:

- Next.js 14 App Router
- TypeScript + Tailwind CSS
- Prisma + PostgreSQL
- FastAPI ML service
- AI helper assistant API

## Features

- Student dashboard
- Topic and subject management
- Adaptive study plan generation
- AI assistant endpoint
- FastAPI ML scoring microservice
- Prisma schema + seed data

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Copy environment file
```bash
cp .env.example .env.local
```

### 3. Generate Prisma client and migrate
```bash
npx prisma generate
npx prisma migrate dev --name init
```

### 4. Seed demo data
```bash
npm run db:seed
```

### 5. Run Next.js
```bash
npm run dev
```

### 6. Run ML service
```bash
cd ml-service
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

## Notes

- The Next.js app calls the FastAPI service via `ML_SERVICE_URL`.
- The AI assistant route currently uses a Hugging Face-compatible chat completions endpoint.
- For production, move authentication and file upload to signed uploads / object storage.
