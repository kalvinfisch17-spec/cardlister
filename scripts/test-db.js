// Run with: node scripts/test-db.js
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env manually
const envPath = resolve(__dirname, "../.env");
try {
  const env = readFileSync(envPath, "utf8");
  for (const line of env.split("\n")) {
    const [key, ...rest] = line.split("=");
    if (key && !key.startsWith("#") && rest.length) {
      process.env[key.trim()] = rest.join("=").trim();
    }
  }
} catch (e) {
  console.error("Could not read .env:", e.message);
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set in .env");
  process.exit(1);
}

console.log("Testing connection to:", url.replace(/:([^:@]+)@/, ":****@"));

const { default: pg } = await import("pg");
const { Pool } = pg;
const pool = new Pool({ connectionString: url, ssl: false });

try {
  const res = await pool.query("SELECT version()");
  console.log("✓ Connected!", res.rows[0].version);
} catch (err) {
  console.error("✗ Connection failed:", err.message);
  console.error("  Code:", err.code);
} finally {
  await pool.end();
}
