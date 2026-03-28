import 'dotenv/config';
import { Pool } from 'pg';

async function resetDatabase() {
  const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000, // 5 second timeout
  });

  console.log('🔄 Connecting to database...');
  
  // Retry logic with delay
  let retries = 3;
  while (retries > 0) {
    try {
      // Test connection first
      await pool.query('SELECT 1');
      console.log('✓ Connected to database');
      break;
    } catch {
      retries--;
      console.log(`⚠️ Connection failed, retrying... (${retries} attempts left)`);
      if (retries === 0) {
        console.error('❌ Failed to connect to database after 3 attempts');
        process.exit(1);
      }
      // Wait 1 second before retrying
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log('\n🗑️  Resetting database...\n');

  try {
    // Reset all account balances to 0
    const accountResult = await pool.query('UPDATE "Account" SET saldo = 0');
    console.log(`✓ Reset ${accountResult.rowCount} account balances to 0`);

    // Delete all cashflow entries
    const cfResult = await pool.query('DELETE FROM "Cashflow"');
    console.log(`✓ Deleted ${cfResult.rowCount} cashflow entries`);

    // Delete all billing entries
    const billResult = await pool.query('DELETE FROM "Billing"');
    console.log(`✓ Deleted ${billResult.rowCount} billing entries`);

    // Delete all students
    const studentResult = await pool.query('DELETE FROM "Student"');
    console.log(`✓ Deleted ${studentResult.rowCount} student entries`);

    console.log('\n✅ Database reset complete!');
    console.log('📤 Now import sample-data.json from /admin page\n');
  } catch (err) {
    console.error('❌ Error during reset:', err.message);
  } finally {
    await pool.end();
  }
}

resetDatabase();
