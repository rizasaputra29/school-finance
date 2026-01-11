import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default:
          "bg-[#c6ef4e] text-gray-900",
        secondary:
          "bg-gray-100 text-gray-700",
        destructive:
          "bg-red-100 text-red-700",
        success:
          "bg-[#c6ef4e]/20 text-gray-800",
        warning:
          "bg-amber-100 text-amber-800",
        outline:
          "border border-gray-200 text-gray-700 bg-white",
        income:
          "bg-[#c6ef4e] text-gray-900",
        expense:
          "bg-gray-200 text-gray-700",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
