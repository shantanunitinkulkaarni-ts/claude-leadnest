const { Client } = require('pg');

const DATABASE_URL = "postgresql://postgres.hinqahjhtgsmljrrozql:TSm6393260332%21%3F@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres";

async function createWaitlistTable() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log("Connected to the database");

    const query = `
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      CREATE TABLE IF NOT EXISTS waitlist (
        id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT NOT NULL,
        agency_name TEXT,
        current_crm TEXT,
        pain_points TEXT,
        feature_requests TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;

    await client.query(query);
    console.log("Waitlist table created successfully.");
  } catch (err) {
    console.error("Error creating waitlist table:", err);
  } finally {
    await client.end();
  }
}

createWaitlistTable();
