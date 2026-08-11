"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function InstallmentRedirect() {
	const router = useRouter();

	useEffect(() => {
		router.replace("/billing");
	}, [router]);

	return (
		<div className="flex h-48 items-center justify-center">
			<p className="text-sm text-gray-500">Mengalihkan ke Biaya Siswa...</p>
		</div>
	);
}
