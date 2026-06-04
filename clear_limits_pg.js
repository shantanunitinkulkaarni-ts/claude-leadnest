const { Client } = require('pg');

const DATABASE_URL = "postgresql://postgres.hinqahjhtgsmljrrozql:TSm6393260332%21%3F@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres";

async function clearLimits() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log("Connected to the database");
    await client.query(`DELETE FROM demo_rate_limits;`);
    console.log("demo_rate_limits wiped.");
  } catch (err) {
    console.error("Error wiping demo_rate_limits table:", err);
  } finally {
    await client.end();
  }
}

clearLimits();
