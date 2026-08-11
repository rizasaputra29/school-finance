"use client";

import { cn } from "@/lib/utils/utils-core";
import { Label } from "@/components/ui/label";
import { cva, type VariantProps } from "class-variance-authority";

const fieldVariants = cva("space-y-1.5", {
	variants: {
		orientation: {
			default: "flex flex-col",
			horizontal: "flex flex-row items-center justify-between gap-4",
		},
	},
	defaultVariants: {
		orientation: "default",
	},
});

interface FieldProps
	extends React.HTMLAttributes<HTMLDivElement>,
		VariantProps<typeof fieldVariants> {
	children: React.ReactNode;
	"data-invalid"?: boolean;
}

export function Field({
	children,
	className,
	orientation,
	"data-invalid": dataInvalid,
	...props
}: FieldProps) {
	return (
		<div
			className={cn(fieldVariants({ orientation }), className)}
			data-invalid={dataInvalid}
			{...props}
		>
			{children}
		</div>
	);
}

interface FieldLabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
	children: React.ReactNode;
}

export function FieldLabel({ children, className, ...props }: FieldLabelProps) {
	return (
		<Label className={cn("text-sm font-medium text-gray-700", className)} {...props}>
			{children}
		</Label>
	);
}

interface FieldDescriptionProps
	extends React.HTMLAttributes<HTMLParagraphElement> {
	children: React.ReactNode;
}

export function FieldDescription({
	children,
	className,
	...props
}: FieldDescriptionProps) {
	return (
		<p className={cn("text-xs text-gray-500", className)} {...props}>
			{children}
		</p>
	);
}

interface FieldErrorProps {
	errors?: Array<{ message?: string }>;
	className?: string;
}

export function FieldError({ errors, className }: FieldErrorProps) {
	if (!errors || errors.length === 0 || !errors[0]?.message) return null;
	return (
		<p className={cn("text-xs text-red-600", className)} role="alert">
			{errors[0].message}
		</p>
	);
}

interface FieldSetProps extends React.HTMLAttributes<HTMLFieldSetElement> {
	children: React.ReactNode;
}

export function FieldSet({ children, className, ...props }: FieldSetProps) {
	return (
		<fieldset className={cn("space-y-3", className)} {...props}>
			{children}
		</fieldset>
	);
}

interface FieldLegendProps
	extends React.HTMLAttributes<HTMLLegendElement> {
	children: React.ReactNode;
	variant?: "label" | "default";
}

export function FieldLegend({
	children,
	className,
	variant = "default",
	...props
}: FieldLegendProps) {
	return (
		<legend
			className={cn(
				variant === "label"
					? "text-sm font-medium text-gray-700"
					: "text-base font-semibold text-gray-900",
				className,
			)}
			{...props}
		>
			{children}
		</legend>
	);
}
