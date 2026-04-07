import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils/utils-core";

const buttonVariants = cva(
	"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 active:scale-[0.98]",
	{
		variants: {
			variant: {
				default:
					"border border-gray-900 bg-white text-gray-900 hover:bg-gray-50",
				primary: "bg-[#059DEA] text-white hover:bg-[#0589d4] border-0",
				destructive:
					"border border-red-500 text-red-600 bg-white hover:bg-red-50",
				outline:
					"border border-gray-300 bg-white hover:bg-gray-50 text-gray-900",
				secondary: "bg-gray-100 text-gray-900 hover:bg-gray-200 border-0",
				ghost: "hover:bg-gray-100 text-gray-700 border-0",
				link: "text-gray-900 underline-offset-4 hover:underline border-0",
			},
			size: {
				default: "h-10 px-5 py-2",
				sm: "h-8 rounded-lg gap-1.5 px-3 text-xs",
				lg: "h-11 rounded-xl px-6 text-base",
				icon: "size-10",
				"icon-sm": "size-8 rounded-lg",
				"icon-lg": "size-11",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

function Button({
	className,
	variant = "default",
	size = "default",
	asChild = false,
	...props
}: React.ComponentProps<"button"> &
	VariantProps<typeof buttonVariants> & {
		asChild?: boolean;
	}) {
	const Comp = asChild ? Slot : "button";

	return (
		<Comp
			data-slot="button"
			data-variant={variant}
			data-size={size}
			className={cn(buttonVariants({ variant, size, className }))}
			{...props}
		/>
	);
}

export { Button, buttonVariants };
