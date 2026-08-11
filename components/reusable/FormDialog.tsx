"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useCallback } from "react";
import type { UseFormReturn, FieldValues } from "react-hook-form";
import { cn } from "@/lib/utils/utils-core";

interface FormDialogProps<T extends FieldValues = FieldValues> {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description?: string;
	children: React.ReactNode;
	className?: string;
	form?: UseFormReturn<T>;
}

export function FormDialog<T extends FieldValues = FieldValues>({
	open,
	onOpenChange,
	title,
	description,
	children,
	className,
	form,
}: FormDialogProps<T>) {
	const handleOpenChange = useCallback(
		(nextOpen: boolean) => {
			onOpenChange(nextOpen);
			if (!nextOpen && form) {
				form.reset();
			}
		},
		[onOpenChange, form],
	);

	return (
		<Dialog.Root open={open} onOpenChange={handleOpenChange}>
			<Dialog.Portal>
				<Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
				<Dialog.Content
					className={cn(
						"fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto",
						className,
					)}
				>
					<div className="flex items-start justify-between gap-4">
						<div>
							<Dialog.Title className="text-lg font-semibold text-slate-900">
								{title}
							</Dialog.Title>
							{description && (
								<Dialog.Description className="mt-1 text-sm text-slate-500">
									{description}
								</Dialog.Description>
							)}
						</div>
						<Dialog.Close asChild>
							<button
								type="button"
								className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
							>
								<X className="h-4 w-4" />
							</button>
						</Dialog.Close>
					</div>
					<div className="mt-6">{children}</div>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
