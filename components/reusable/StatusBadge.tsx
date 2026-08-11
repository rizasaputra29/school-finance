"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/utils-core";
import { cva, type VariantProps } from "class-variance-authority";

const statusBadgeVariants = cva("", {
	variants: {
		variant: {
			default: "bg-slate-100 text-slate-700 hover:bg-slate-100",
			success: "bg-green-100 text-green-700 hover:bg-green-100",
			warning: "bg-amber-100 text-amber-700 hover:bg-amber-100",
			danger: "bg-red-100 text-red-700 hover:bg-red-100",
			info: "bg-blue-100 text-blue-700 hover:bg-blue-100",
		},
	},
	defaultVariants: {
		variant: "default",
	},
});

interface StatusBadgeProps extends VariantProps<typeof statusBadgeVariants> {
	label: string;
	className?: string;
}

export function StatusBadge({ label, variant, className }: StatusBadgeProps) {
	return (
		<Badge
			variant="outline"
			className={cn(statusBadgeVariants({ variant }), className)}
		>
			{label}
		</Badge>
	);
}
