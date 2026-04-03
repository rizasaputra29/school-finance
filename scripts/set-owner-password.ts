import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import { createId } from '@paralleldrive/cuid2';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function setOwnerPassword() {
  const ownerEmail = process.argv[2] || 'owner@school.finance';
  const ownerPassword = process.argv[3] || 'ownerpass';

  console.log(`Setting password for: ${ownerEmail}`);

  try {
    // Find the user
    const user = await (prisma as any).user.findUnique({
      where: { email: ownerEmail },
    });

    if (!user) {
      console.error(`User ${ownerEmail} not found. Please run seed first.`);
      process.exit(1);
    }

    console.log(`Found user: ${user.id}`);

    // Check if account already exists
    const existingAccount = await (prisma as any).authAccount.findFirst({
      where: {
        userId: user.id,
        providerId: 'credential',
      },
    });

    if (existingAccount) {
      console.log('Account already exists. Updating password...');
      
      // Hash password with bcrypt (10 rounds like Better Auth)
      const hashedPassword = await bcrypt.hash(ownerPassword, 10);
      
      await (prisma as any).authAccount.update({
        where: { id: existingAccount.id },
        data: { password: hashedPassword },
      });
      
      console.log('✅ Password updated successfully!');
    } else {
      console.log('Creating new credential account...');
      
      // Hash password with bcrypt (10 rounds like Better Auth)
      const hashedPassword = await bcrypt.hash(ownerPassword, 10);
      
      // Create AuthAccount record
      await (prisma as any).authAccount.create({
        data: {
          id: createId(),
          userId: user.id,
          accountId: ownerEmail,
          providerId: 'credential',
          password: hashedPassword,
        },
      });
      
      console.log('✅ Password set successfully!');
    }

    console.log(`\nLogin credentials:`);
    console.log(`  Email: ${ownerEmail}`);
    console.log(`  Password: ${ownerPassword}`);
    console.log(`\nYou can now login at: http://localhost:3000/login`);

  } catch (error) {
    console.error('Error setting password:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    pool.end();
  }
}

setOwnerPassword();
