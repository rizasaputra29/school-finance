import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/utils-core";

const badgeVariants = cva(
	"inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors",
	{
		variants: {
			variant: {
				default: "bg-[#059DEA] text-white",
				secondary: "bg-gray-100 text-gray-700",
				destructive: "bg-red-100 text-red-700",
				success: "bg-[#059DEA]/20 text-[#059DEA]",
				warning: "bg-amber-100 text-amber-800",
				outline: "border border-gray-200 text-gray-700 bg-white",
				income: "bg-[#059DEA] text-white",
				expense: "bg-gray-200 text-gray-700",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	},
);

export interface BadgeProps
	extends
		React.HTMLAttributes<HTMLDivElement>,
		VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
	return (
		<div className={cn(badgeVariants({ variant }), className)} {...props} />
	);
}

export { Badge, badgeVariants };
