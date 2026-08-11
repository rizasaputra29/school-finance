"use client";

import {
	useReactTable,
	getCoreRowModel,
	getFilteredRowModel,
	getPaginationRowModel,
	flexRender,
	type ColumnDef,
	type PaginationState,
	type Row,
} from "@tanstack/react-table";
import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { cn } from "@/lib/utils/utils-core";

interface DataTableProps<TData, TValue> {
	columns: ColumnDef<TData, TValue>[];
	data: TData[];
	searchKey?: string;
	searchPlaceholder?: string;
	isLoading?: boolean;
	pageCount?: number;
	pagination?: PaginationState;
	onPaginationChange?: (pagination: PaginationState) => void;
	manualFiltering?: boolean;
	emptyMessage?: string;
	onRowClick?: (row: Row<TData>) => void;
	className?: string;
}

function DataTableSkeleton({ columnCount }: { columnCount: number }) {
	return (
		<TableRow>
			<TableCell colSpan={columnCount} className="h-24">
				<div className="space-y-3">
					{Array.from({ length: 5 }).map((_, i) => (
						<div key={i} className="flex items-center gap-4">
							{Array.from({ length: columnCount }).map((__, j) => (
								<Skeleton key={j} className="h-4 flex-1" />
							))}
						</div>
					))}
				</div>
			</TableCell>
		</TableRow>
	);
}

export function DataTable<TData, TValue>({
	columns,
	data,
	searchKey,
	searchPlaceholder = "Cari...",
	isLoading = false,
	pageCount: controlledPageCount,
	pagination: controlledPagination,
	onPaginationChange,
	manualFiltering = false,
	emptyMessage = "Tidak ada data",
	onRowClick,
	className,
}: DataTableProps<TData, TValue>) {
	const [globalFilter, setGlobalFilter] = useState("");
	const [uncontrolledPagination, setUncontrolledPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: 10,
	});

	const pagination = controlledPagination ?? uncontrolledPagination;

	const handlePaginationChange = useMemo(() => {
		if (onPaginationChange) {
			return (updater: PaginationState | ((old: PaginationState) => PaginationState)) => {
				const newPagination = typeof updater === "function" ? updater(pagination) : updater;
				onPaginationChange(newPagination);
			};
		}
		return setUncontrolledPagination;
	}, [onPaginationChange, pagination]);

	const table = useReactTable({
		data,
		columns,
		pageCount: controlledPageCount,
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: manualFiltering ? undefined : getFilteredRowModel(),
		getPaginationRowModel: controlledPagination ? undefined : getPaginationRowModel(),
		manualFiltering,
		manualPagination: !!controlledPagination,
		state: {
			globalFilter: searchKey ? globalFilter : undefined,
			pagination,
		},
		onGlobalFilterChange: searchKey ? setGlobalFilter : undefined,
		onPaginationChange: handlePaginationChange,
	});

	return (
		<div className={cn("space-y-4", className)}>
			{searchKey && (
				<div className="relative">
					<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
					<Input
						placeholder={searchPlaceholder}
						value={globalFilter}
						onChange={(e) => {
							setGlobalFilter(e.target.value);
							if (onPaginationChange) {
								handlePaginationChange({ pageIndex: 0, pageSize: pagination.pageSize });
							}
						}}
						className="pl-10"
					/>
				</div>
			)}

			<div className="rounded-lg border border-slate-200">
				<Table>
					<TableHeader>
						{table.getHeaderGroups().map((headerGroup) => (
							<TableRow key={headerGroup.id} className="bg-slate-50">
								{headerGroup.headers.map((header) => (
									<TableHead key={header.id}>
										{header.isPlaceholder
											? null
											: flexRender(header.column.columnDef.header, header.getContext())}
									</TableHead>
								))}
							</TableRow>
						))}
					</TableHeader>
					<TableBody>
						{isLoading ? (
							<DataTableSkeleton columnCount={columns.length} />
						) : table.getRowModel().rows.length > 0 ? (
							table.getRowModel().rows.map((row) => (
								<TableRow
									key={row.id}
									data-state={row.getIsSelected() ? "selected" : undefined}
									className={cn(onRowClick && "cursor-pointer")}
									onClick={() => onRowClick?.(row)}
								>
									{row.getVisibleCells().map((cell) => (
										<TableCell key={cell.id}>
											{flexRender(cell.column.columnDef.cell, cell.getContext())}
										</TableCell>
									))}
								</TableRow>
							))
						) : (
							<TableRow>
								<TableCell
									colSpan={columns.length}
									className="h-48 text-center text-gray-500"
								>
									{emptyMessage}
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>

			<DataTablePagination table={table} />
		</div>
	);
}
