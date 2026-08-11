"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/utils-core";

export interface WizardStep {
	id: string;
	title: string;
	description?: string;
}

interface WizardModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description?: string;
	steps: WizardStep[];
	currentStep: number;
	children: React.ReactNode;
	onNext: () => void;
	onBack: () => void;
	isNextDisabled?: boolean;
	isBackDisabled?: boolean;
	isSubmitting?: boolean;
	className?: string;
}

export function WizardModal({
	open,
	onOpenChange,
	title,
	description,
	steps,
	currentStep,
	children,
	onNext,
	onBack,
	isNextDisabled = false,
	isBackDisabled = false,
	isSubmitting = false,
	className,
}: WizardModalProps) {
	const progress = ((currentStep + 1) / steps.length) * 100;
	const isLastStep = currentStep === steps.length - 1;

	return (
		<Dialog.Root open={open} onOpenChange={onOpenChange}>
			<Dialog.Portal>
				<Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
				<Dialog.Content
					className={cn(
						"fixed left-1/2 top-1/2 z-50 w-full max-w-xl -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-0 shadow-2xl max-h-[90vh] overflow-hidden",
						className,
					)}
				>
					<div className="p-6 border-b border-gray-100">
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

						<div className="mt-5">
							<div className="flex items-center justify-between text-xs text-gray-500 mb-2">
								<span>
									Langkah {currentStep + 1} dari {steps.length}
								</span>
								<span>{steps[currentStep]?.title}</span>
							</div>
							<div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
								<div
									className="h-full rounded-full bg-[#059DEA] transition-all duration-300"
									style={{ width: `${progress}%` }}
								/>
							</div>
						</div>
					</div>

					<div className="p-6 overflow-y-auto max-h-[60vh]">{children}</div>

					<div className="p-6 border-t border-gray-100 flex justify-between">
						<Button
							type="button"
							variant="outline"
							onClick={onBack}
							disabled={isBackDisabled || currentStep === 0 || isSubmitting}
						>
							Kembali
						</Button>
					<Button
						type="button"
						onClick={onNext}
						disabled={isNextDisabled || isSubmitting}
					>
						{isSubmitting
							? "Memproses..."
							: isLastStep
							  ? "Simpan"
							  : "Lanjut"}
					</Button>
					</div>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
