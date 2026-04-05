"use server";

import { auth } from "@/lib/auth/auth-server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ReactNode } from "react";

interface AuthGuardProps {
	children: ReactNode;
}

export async function AuthGuard({ children }: AuthGuardProps) {
	const session = await auth.api.getSession({
		headers: await headers(),
	});

	if (!session) {
		redirect("/login?expired=true");
	}

	return <>{children}</>;
}
