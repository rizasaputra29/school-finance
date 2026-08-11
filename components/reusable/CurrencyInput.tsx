"use client";

import { forwardRef } from "react";
import { Input } from "@/components/ui/input";
import { formatNumberInput, parseFormattedNumber } from "@/lib/utils/utils-core";

interface CurrencyInputProps
	extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
}

export const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(
	({ value, onChange, placeholder = "0", className, ...props }, ref) => {
		return (
			<div className="relative">
				<span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">
					Rp
				</span>
				<Input
					ref={ref}
					type="text"
					inputMode="numeric"
					value={value}
					onChange={(e) => onChange(formatNumberInput(e.target.value))}
					placeholder={placeholder}
					className={`pl-10 ${className || ""}`}
					{...props}
				/>
			</div>
		);
	},
);

CurrencyInput.displayName = "CurrencyInput";

export { parseFormattedNumber };
