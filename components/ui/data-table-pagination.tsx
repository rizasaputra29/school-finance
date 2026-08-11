"use client";

import type { Table } from "@tanstack/react-table";
import {
	Pagination,
	PaginationContent,
	PaginationItem,
	PaginationNext,
	PaginationPrevious,
} from "@/components/ui/pagination";

interface DataTablePaginationProps<TData> {
	table: Table<TData>;
	showSelection?: boolean;
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

export function DataTablePagination<TData>({
	table,
	showSelection = false,
}: DataTablePaginationProps<TData>) {
	const pageIndex = table.getState().pagination.pageIndex;
	const pageSize = table.getState().pagination.pageSize;
	const totalRows = table.getFilteredRowModel().rows.length;
	const startRow = totalRows === 0 ? 0 : pageIndex * pageSize + 1;
	const endRow = Math.min((pageIndex + 1) * pageSize, totalRows);

	return (
		<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
			<div className="flex items-center gap-2">
				{showSelection && table.getFilteredSelectedRowModel().rows.length > 0 && (
					<p className="text-sm text-gray-500">
						{table.getFilteredSelectedRowModel().rows.length} dari{" "}
						{table.getFilteredRowModel().rows.length} dipilih
					</p>
				)}
				<p className="text-sm text-gray-500">
					Menampilkan {startRow}-{endRow} dari {totalRows} data
				</p>
			</div>

			<div className="flex items-center gap-4">
				<div className="flex items-center gap-2">
					<p className="text-sm text-gray-500">Baris per halaman</p>
					<select
						value={table.getState().pagination.pageSize}
						onChange={(e) => {
							table.setPageSize(Number(e.target.value));
						}}
						className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:border-[#059DEA] focus:outline-none focus:ring-1 focus:ring-[#059DEA]"
					>
						{PAGE_SIZE_OPTIONS.map((size) => (
							<option key={size} value={size}>
								{size}
							</option>
						))}
					</select>
				</div>

				<Pagination>
					<PaginationContent>
						<PaginationItem>
							<PaginationPrevious
								text="Sebelumnya"
								onClick={() => table.previousPage()}
								className={!table.getCanPreviousPage() ? "pointer-events-none opacity-50" : "cursor-pointer"}
							/>
						</PaginationItem>
						<PaginationItem>
							<span className="flex h-9 min-w-9 items-center justify-center px-2 text-sm font-medium text-gray-700">
								{pageIndex + 1} / {table.getPageCount()}
							</span>
						</PaginationItem>
						<PaginationItem>
							<PaginationNext
								text="Selanjutnya"
								onClick={() => table.nextPage()}
								className={!table.getCanNextPage() ? "pointer-events-none opacity-50" : "cursor-pointer"}
							/>
						</PaginationItem>
					</PaginationContent>
				</Pagination>
			</div>
		</div>
	);
}
