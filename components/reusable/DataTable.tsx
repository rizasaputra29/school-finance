"use client";

import {
	useReactTable,
	getCoreRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	getFilteredRowModel,
	getExpandedRowModel,
	flexRender,
	type ColumnDef,
	type SortingState,
	type ColumnFiltersState,
	type PaginationState,
	type ExpandedState,
	type Row,
} from "@tanstack/react-table";
import { useState, Fragment } from "react";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ChevronRight as ChevronIcon } from "lucide-react";
import { cn } from "@/lib/utils/utils-core";

interface ServerPagination {
	pageIndex: number;
	pageSize: number;
	total: number;
	onPaginationChange: (pagination: PaginationState) => void;
}

interface DataTableProps<TData> {
	columns: ColumnDef<TData>[];
	data: TData[];
	pageSize?: number;
	loading?: boolean;
	emptyMessage?: string;
	className?: string;
	serverPagination?: ServerPagination;
	getSubRows?: (row: TData) => TData[] | undefined;
	renderSubComponent?: (props: { row: Row<TData> }) => React.ReactNode;
}

export function DataTable<TData>({
	columns,
	data,
	pageSize = 10,
	loading = false,
	emptyMessage = "Tidak ada data",
	className,
	serverPagination,
	getSubRows,
	renderSubComponent,
}: DataTableProps<TData>) {
	const [sorting, setSorting] = useState<SortingState>([]);
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
	const [expanded, setExpanded] = useState<ExpandedState>({});

	const isServerSide = !!serverPagination;
	const hasSubRows = !!getSubRows;

	const table = useReactTable({
		data,
		columns,
		getCoreRowModel: getCoreRowModel(),
		...(hasSubRows
			? { getExpandedRowModel: getExpandedRowModel(), getSubRows }
			: {}),
		...(isServerSide
			? {}
			: { getPaginationRowModel: getPaginationRowModel() }),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		onSortingChange: setSorting,
		onColumnFiltersChange: setColumnFilters,
		onExpandedChange: setExpanded,
		...(isServerSide
			? {
					manualPagination: true,
					pageCount: Math.ceil(serverPagination.total / serverPagination.pageSize),
					onPaginationChange: (updater) => {
						const newPagination =
							typeof updater === "function"
								? updater({
										pageIndex: serverPagination.pageIndex,
										pageSize: serverPagination.pageSize,
									})
								: updater;
						serverPagination.onPaginationChange(newPagination);
					},
				}
			: {}),
		state: {
			sorting,
			columnFilters,
			expanded,
			...(isServerSide
				? {
						pagination: {
							pageIndex: serverPagination.pageIndex,
							pageSize: serverPagination.pageSize,
						},
					}
				: {}),
		},
		...(!isServerSide
			? {
					initialState: {
						pagination: { pageSize },
					},
				}
			: {}),
	});

	return (
		<div className={cn("space-y-4", className)}>
			<div className="overflow-x-auto rounded-lg border border-gray-200">
				<Table>
					<TableHeader>
						{table.getHeaderGroups().map((headerGroup) => (
							<TableRow key={headerGroup.id} className="bg-gray-50">
								{headerGroup.headers.map((header) => (
									<TableHead key={header.id}>
										{header.isPlaceholder
											? null
											: flexRender(
													header.column.columnDef.header,
													header.getContext(),
											  )}
									</TableHead>
								))}
							</TableRow>
						))}
					</TableHeader>
					<TableBody>
						{loading ? (
							<TableRow>
								<TableCell
									colSpan={columns.length}
									className="h-48 text-center text-gray-500"
								>
									Memuat...
								</TableCell>
							</TableRow>
						) : table.getRowModel().rows.length > 0 ? (
							table.getRowModel().rows.map((row) => (
								<Fragment key={row.id}>
									<TableRow className="hover:bg-gray-50">
										{row.getVisibleCells().map((cell) => (
											<TableCell key={cell.id}>
												{flexRender(
													cell.column.columnDef.cell,
													cell.getContext(),
												)}
											</TableCell>
										))}
									</TableRow>
									{row.getIsExpanded() && renderSubComponent && (
										<TableRow className="bg-gray-50/50 hover:bg-gray-50/50">
											<TableCell colSpan={columns.length} className="p-0">
												{renderSubComponent({ row })}
											</TableCell>
										</TableRow>
									)}
								</Fragment>
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

			{table.getPageCount() > 1 && (
				<div className="flex items-center justify-between">
					<p className="text-sm text-gray-500">
						Halaman {table.getState().pagination.pageIndex + 1} dari{" "}
						{table.getPageCount()}{" "}
						{isServerSide ? `(${serverPagination.total} data)` : `(${data.length} data)`}
					</p>
					<div className="flex gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={() => table.previousPage()}
							disabled={!table.getCanPreviousPage()}
						>
							<ChevronLeft className="h-4 w-4" />
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={() => table.nextPage()}
							disabled={!table.getCanNextPage()}
						>
							<ChevronRight className="h-4 w-4" />
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
