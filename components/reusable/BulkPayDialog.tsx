"use client";

import { useState, useMemo } from "react";
import { FormDialog } from "./FormDialog";
import { Button } from "@/components/ui/button";
import { formatRupiah } from "@/lib/utils/utils-currency";
import { formatDateShort } from "@/lib/utils/utils-date";

interface BulkPayItem {
	id: string;
	label: string;
	keterangan?: string | null;
	jumlah: number;
	tanggalJatuhTempo?: string | Date | null;
	statusBayar: string;
}

interface BulkPayDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description?: string;
	items: BulkPayItem[];
	isPending: boolean;
	onConfirm: (selectedIds: string[], source: "kas" | "bank") => void;
}

export function BulkPayDialog({
	open,
	onOpenChange,
	title,
	description,
	items,
	isPending,
	onConfirm,
}: BulkPayDialogProps) {
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [paymentSource, setPaymentSource] = useState<"kas" | "bank">("kas");

	const unpaidItems = useMemo(
		() => items.filter((item) => item.statusBayar !== "Lunas"),
		[items],
	);

	const selectedTotal = useMemo(() => {
		return unpaidItems
			.filter((item) => selectedIds.has(item.id))
			.reduce((sum, item) => sum + item.jumlah, 0);
	}, [unpaidItems, selectedIds]);

	const allSelected =
		unpaidItems.length > 0 && unpaidItems.every((item) => selectedIds.has(item.id));

	const toggleAll = () => {
		if (allSelected) {
			setSelectedIds(new Set());
		} else {
			setSelectedIds(new Set(unpaidItems.map((item) => item.id)));
		}
	};

	const toggleItem = (id: string) => {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	};

	const handleConfirm = () => {
		onConfirm(Array.from(selectedIds), paymentSource);
	};

	const handleOpenChange = (nextOpen: boolean) => {
		if (!nextOpen) {
			setSelectedIds(new Set());
			setPaymentSource("kas");
		}
		onOpenChange(nextOpen);
	};

	return (
		<FormDialog
			open={open}
			onOpenChange={handleOpenChange}
			title={title}
			description={description}
			className="max-w-lg"
		>
			<div className="space-y-4">
				{unpaidItems.length === 0 ? (
					<p className="text-sm text-slate-500 text-center py-4">
						Semua tagihan sudah lunas
					</p>
				) : (
					<>
						<div className="flex items-center gap-2 pb-2 border-b">
							<input
								type="checkbox"
								id="select-all"
								checked={allSelected}
								onChange={toggleAll}
								className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
							/>
							<label
								htmlFor="select-all"
								className="text-sm font-medium text-gray-700 cursor-pointer"
							>
								Pilih Semua ({unpaidItems.length} tagihan)
							</label>
						</div>

						<div className="max-h-60 overflow-y-auto space-y-2">
							{unpaidItems.map((item) => (
								<div
									key={item.id}
									className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50"
								>
								<input
									type="checkbox"
									id={item.id}
									checked={selectedIds.has(item.id)}
									onChange={() => toggleItem(item.id)}
									className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
								/>
									<div className="flex-1 min-w-0">
										<p className="text-sm font-medium text-gray-900 truncate">
											{item.label}
										</p>
										{item.keterangan && (
											<p className="text-xs text-gray-500 truncate">
												{item.keterangan}
											</p>
										)}
										{item.tanggalJatuhTempo && (
											<p className="text-xs text-gray-400">
												Jatuh tempo: {formatDateShort(item.tanggalJatuhTempo)}
											</p>
										)}
									</div>
									<span className="text-sm font-semibold text-gray-700 whitespace-nowrap">
										{formatRupiah(item.jumlah)}
									</span>
								</div>
							))}
						</div>
					</>
				)}

				{selectedIds.size > 0 && (
					<div className="rounded-lg bg-blue-50 p-3">
						<p className="text-sm text-blue-800">
							<span className="font-medium">{selectedIds.size} tagihan dipilih</span>
							{" — "}
							<span className="font-bold">{formatRupiah(selectedTotal)}</span>
						</p>
					</div>
				)}

				<div className="space-y-2">
					<label className="text-sm font-medium text-gray-700">
						Sumber Pembayaran
					</label>
					<div className="flex gap-2">
						<Button
							type="button"
							variant={paymentSource === "kas" ? "default" : "outline"}
							size="sm"
							className="flex-1"
							onClick={() => setPaymentSource("kas")}
						>
							Kas
						</Button>
						<Button
							type="button"
							variant={paymentSource === "bank" ? "default" : "outline"}
							size="sm"
							className="flex-1"
							onClick={() => setPaymentSource("bank")}
						>
							Bank
						</Button>
					</div>
				</div>

				<div className="flex justify-end gap-3 pt-2">
					<Button
						variant="outline"
						onClick={() => handleOpenChange(false)}
					>
						Batal
					</Button>
					<Button
						onClick={handleConfirm}
						disabled={selectedIds.size === 0 || isPending}
					>
						{isPending
							? "Memproses..."
							: `Bayar ${selectedIds.size} Tagihan`}
					</Button>
				</div>
			</div>
		</FormDialog>
	);
}
