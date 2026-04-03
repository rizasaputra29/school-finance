import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function recreateOwner() {
  const ownerEmail = process.argv[2] || 'owner@school.finance';
  const ownerPassword = process.argv[3] || 'ownerpass';
  const ownerName = process.argv[4] || 'School Owner';

  console.log(`Recreating owner user: ${ownerEmail}`);

  try {
    // Step 1: Find and delete existing user
    console.log('Step 1: Checking for existing user...');
    const existingUser = await (prisma as any).user.findUnique({
      where: { email: ownerEmail },
    });

    if (existingUser) {
      console.log(`Found existing user: ${existingUser.id}`);
      
      // Delete related AuthAccount first
      await (prisma as any).authAccount.deleteMany({
        where: { userId: existingUser.id },
      });
      console.log('  Deleted existing AuthAccount(s)');
      
      // Delete sessions
      await (prisma as any).session.deleteMany({
        where: { userId: existingUser.id },
      });
      console.log('  Deleted existing Session(s)');
      
      // Delete user
      await (prisma as any).user.delete({
        where: { id: existingUser.id },
      });
      console.log('  Deleted existing User');
    } else {
      console.log('No existing user found');
    }

    // Step 2: Create user via Better Auth API
    console.log('\nStep 2: Creating user via Better Auth API...');
    
    const response = await fetch('http://localhost:3000/api/auth/sign-up/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:3000',
      },
      body: JSON.stringify({
        email: ownerEmail,
        password: ownerPassword,
        name: ownerName,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || `Failed to create user: ${response.statusText}`);
    }

    console.log('✅ User created successfully via Better Auth!');
    console.log(`  User ID: ${data.user?.id}`);
    console.log(`  Email: ${data.user?.email}`);
    console.log(`  Role: ${data.user?.role || 'user (will be updated)'}`);

    // Step 3: Update role to owner
    console.log('\nStep 3: Updating role to owner...');
    await (prisma as any).user.update({
      where: { email: ownerEmail },
      data: { role: 'owner' },
    });
    console.log('✅ Role updated to owner');

    console.log('\n✅ Owner user recreated successfully!');
    console.log(`\nLogin credentials:`);
    console.log(`  Email: ${ownerEmail}`);
    console.log(`  Password: ${ownerPassword}`);
    console.log(`\nYou can now login at: http://localhost:3000/login`);

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    pool.end();
  }
}

recreateOwner();
