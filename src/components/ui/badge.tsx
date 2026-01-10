import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "bg-blue-100 text-blue-700 hover:bg-blue-200",
        secondary:
          "bg-slate-100 text-slate-700 hover:bg-slate-200",
        destructive:
          "bg-red-100 text-red-700 hover:bg-red-200",
        success:
          "bg-emerald-100 text-emerald-700 hover:bg-emerald-200",
        warning:
          "bg-amber-100 text-amber-700 hover:bg-amber-200",
        outline:
          "border-2 border-slate-200 text-slate-700 hover:bg-slate-50",
        income:
          "bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-sm",
        expense:
          "bg-gradient-to-r from-red-500 to-red-600 text-white shadow-sm",
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
