# CardLister

A self-hosted trading card eBay listing tool. Upload photos of your cards, AI identifies each card's name, set, number, condition, and holo type (standard / holo / reverse holo), looks up recent eBay sold prices, and bulk-pushes polished listings to eBay in one go — no monthly subscription required.

---

## What it does

- **AI card scanning** — drop in card photos; GPT vision identifies every detail automatically
- **Holo detection** — distinguishes standard, holo, and reverse holo cards
- **Auto-pricing** — searches eBay recently sold listings and suggests a price
- **Consistent titles & descriptions** — templates that match eBay best practices
- **Bulk workflow** — upload 100s of cards at once, review, then push all listings in a single click
- **eBay integration** — connects via OAuth to list directly on your account

---

## Local setup

### Prerequisites

- [Node.js 24+](https://nodejs.org/)
- [pnpm](https://pnpm.io/installation) — `npm install -g pnpm`
- [PostgreSQL 15+](https://www.postgresql.org/download/)

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/cardlister.git
cd cardlister
pnpm install
```

### 2. Set environment variables

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Required — PostgreSQL connection string
DATABASE_URL=postgresql://postgres:password@localhost:5432/cardlister

# Required — OpenAI API key for card image analysis
# Get one at https://platform.openai.com/api-keys
AI_INTEGRATIONS_OPENAI_API_KEY=sk-...
AI_INTEGRATIONS_OPENAI_BASE_URL=https://api.openai.com/v1

# Required for eBay listing creation
# Get these at https://developer.ebay.com → My Account → Application Keys (Production)
EBAY_CLIENT_ID=your-ebay-app-id
EBAY_CLIENT_SECRET=your-ebay-cert-id
# Must match the RuName you set in your eBay app's OAuth settings
EBAY_REDIRECT_URI=http://localhost:5001/api/ebay/callback
# Set to "true" to use eBay sandbox for testing
EBAY_SANDBOX=false

# Session secret — any random string
SESSION_SECRET=change-me-to-a-random-string
```

### 3. Create the database

```bash
createdb cardlister
pnpm --filter @workspace/db run push
```

### 4. Run the app

Open two terminals:

**Terminal 1 — API server:**
```bash
PORT=5001 BASE_PATH=/api pnpm --filter @workspace/api-server run dev
```

**Terminal 2 — Frontend:**
```bash
PORT=3000 BASE_PATH=/ pnpm --filter @workspace/card-lister run dev
```

Then open [http://localhost:3000](http://localhost:3000).

---

## Connecting eBay

1. Go to [developer.ebay.com](https://developer.ebay.com) → My Account → Application Keys
2. Create a **Production** app (or use an existing one)
3. Under **User Tokens** → **Get a Token from eBay via Your Application** → add your redirect URI:  
   `http://localhost:3000/api/ebay/callback` (or your server's URL)
4. Copy the **App ID** → `EBAY_CLIENT_ID`  
   Copy the **Cert ID** → `EBAY_CLIENT_SECRET`
5. Restart the API server, then go to **Settings** in the app and click **Connect eBay**

---

## Keeping cards up to date

Cards you add are stored in your local PostgreSQL database — they persist indefinitely. To add more cards any time:
- Go to **Upload & Analyze** → drop in new photos
- The AI scans them and adds them to your collection
- Review in **Card Collection**, get pricing, then push to eBay

Your database grows as your collection grows. Back it up with:
```bash
pg_dump cardlister > cardlister_backup_$(date +%Y%m%d).sql
```

---

## Stack

- **Frontend:** React 19 + Vite + Tailwind CSS
- **Backend:** Node.js 24 + Express 5
- **Database:** PostgreSQL + Drizzle ORM
- **AI:** OpenAI GPT-4 vision for card identification
- **API contracts:** OpenAPI → codegen (Orval) for typed hooks

## Project structure

```
artifacts/
  api-server/        — Express API (card analysis, eBay integration, listings)
  card-lister/       — React frontend
lib/
  api-spec/          — OpenAPI spec (source of truth for all endpoints)
  api-client-react/  — Generated React Query hooks
  api-zod/           — Generated Zod validators
  db/                — Drizzle ORM schema and client
  integrations-openai-ai-server/ — OpenAI client
```
