"use client";

import { useState, useMemo, forwardRef } from "react";
import { Input } from "@/components/ui/input";
import { useDebounce } from "use-debounce";

export interface SearchableSelectOption {
	value: string;
	label: string;
	subLabel?: string;
}

interface SearchableSelectProps {
	options: SearchableSelectOption[];
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	searchPlaceholder?: string;
	emptyMessage?: string;
	label?: string;
	disabled?: boolean;
}

export const SearchableSelect = forwardRef<
	HTMLInputElement,
	SearchableSelectProps
>(
	(
		{
			options,
			value,
			onChange,
			placeholder = "Pilih...",
			searchPlaceholder = "Cari...",
			emptyMessage = "Tidak ada data ditemukan",
			label,
			disabled = false,
		},
		ref,
	) => {
		const [search, setSearch] = useState("");
		const [debouncedSearch] = useDebounce(search, 200);
		const [isOpen, setIsOpen] = useState(false);

		const selectedOption = useMemo(
			() => options.find((opt) => opt.value === value),
			[options, value],
		);

		const filteredOptions = useMemo(() => {
			const term = debouncedSearch.toLowerCase();
			return options.filter(
				(opt) =>
					opt.label.toLowerCase().includes(term) ||
					opt.subLabel?.toLowerCase().includes(term),
			);
		}, [options, debouncedSearch]);

		const handleSelect = (optValue: string) => {
			onChange(optValue);
			setSearch("");
			setIsOpen(false);
		};

		return (
			<div className="relative">
				{label && (
					<label className="text-sm font-medium text-gray-700 mb-1 block">
						{label}
					</label>
				)}
				<Input
					ref={ref}
					type="text"
					placeholder={placeholder}
					value={isOpen ? search : selectedOption?.label || ""}
					onChange={(e) => {
						setSearch(e.target.value);
						if (!isOpen) setIsOpen(true);
					}}
					onFocus={() => {
						setIsOpen(true);
						setSearch("");
					}}
					disabled={disabled}
					readOnly={!isOpen}
				/>
				{isOpen && !disabled && (
					<div className="absolute z-10 left-0 right-0 mt-1 max-h-60 overflow-y-auto border border-gray-200 rounded-lg bg-white shadow-lg">
						<div className="sticky top-0 bg-white p-2 border-b border-gray-100">
							<Input
								type="text"
								placeholder={searchPlaceholder}
								value={search}
								onChange={(e) => setSearch(e.target.value)}
								onClick={(e) => e.stopPropagation()}
								autoFocus
								className="border-0 shadow-none focus-visible:ring-0"
							/>
						</div>
						{filteredOptions.length > 0 ? (
							filteredOptions.slice(0, 50).map((opt) => (
								<button
									key={opt.value}
									type="button"
									onClick={() => handleSelect(opt.value)}
									className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 transition-colors ${
										opt.value === value ? "bg-[#059DEA]/30 font-medium" : ""
									}`}
								>
									<span className="font-medium">{opt.label}</span>
									{opt.subLabel && (
										<span className="text-gray-500 ml-1">
											({opt.subLabel})
										</span>
									)}
								</button>
								))
							) : (
								<p className="px-3 py-2 text-sm text-gray-500">{emptyMessage}</p>
							)}
						</div>
					)}
					{isOpen && !disabled && (
						<div
							className="fixed inset-0 z-[-1]"
							onClick={() => setIsOpen(false)}
							aria-hidden="true"
						/>
					)}
				</div>
			);
		},
	);

SearchableSelect.displayName = "SearchableSelect";
