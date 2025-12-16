# Board Game Club Status Board

## Project Overview
This is a real-time status board for the board game club, built with SvelteKit and PostgreSQL.

## Tech Stack
- **Frontend**: SvelteKit
- **Backend**: SvelteKit Server Actions / API Routes
- **Database**: PostgreSQL
- **Infrastructure**: Docker & Docker Compose

## Getting Started

### Prerequisites
- Docker & Docker Compose
- Node.js (for local development)

### Running with Docker (Recommended)
```bash
docker-compose up --build
```
The app will be available at `http://localhost:3000`.

### Local Development
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the database:
   ```bash
   docker-compose up db -d
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
