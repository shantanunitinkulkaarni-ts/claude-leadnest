const { Client } = require('pg');

const DATABASE_URL = "postgresql://postgres.hinqahjhtgsmljrrozql:TSm6393260332%21%3F@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres";

async function createTable() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log("Connected to the database");

    const query = `
      CREATE TABLE IF NOT EXISTS demo_rate_limits (
        ip_address TEXT PRIMARY KEY,
        session_count INTEGER DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;

    await client.query(query);
    console.log("demo_rate_limits table created successfully.");
  } catch (err) {
    console.error("Error creating demo_rate_limits table:", err);
  } finally {
    await client.end();
  }
}

createTable();
