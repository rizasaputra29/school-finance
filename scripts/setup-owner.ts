import { auth } from "@/lib/auth";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function setupOwner() {
	const ownerEmail = process.argv[2] || "owner@school.finance";
	const ownerPassword = process.argv[3] || "ownerpass";

	console.log(`Setting up owner account: ${ownerEmail}`);

	// Check if user exists
	const existingUser = await prisma.user.findUnique({
		where: { email: ownerEmail },
	});

	if (!existingUser) {
		console.error("Owner user not found in database. Please run seed first.");
		process.exit(1);
	}

	// Create account with password using Better Auth
	try {
		await auth.api.signUpEmail({
			body: {
				email: ownerEmail,
				password: ownerPassword,
				name: existingUser.name || "School Owner",
			},
		});
		console.log("✅ Owner password set successfully!");
		console.log(`Email: ${ownerEmail}`);
		console.log(`Password: ${ownerPassword}`);
	} catch (error: any) {
		// If user already has an account, update password
		if (error.message?.includes("already exists")) {
			console.log("Account already exists, attempting to update password...");
			// Note: Better Auth doesn't have a direct setPassword API
			// You would need to use password reset flow or delete and recreate
			console.log(
				"Please use password reset flow if password update is needed.",
			);
		} else {
			console.error("Error setting up owner:", error);
			process.exit(1);
		}
	}

	await prisma.$disconnect();
}

setupOwner().catch((error) => {
	console.error("Setup failed:", error);
	process.exit(1);
});
