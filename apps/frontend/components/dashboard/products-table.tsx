'use client';

import { useState, useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Category, CategoryEmojis } from '@/constants/category';
// eslint-disable-next-line @nx/enforce-module-boundaries
import type { Product } from '@backend/src/modules/products/entities/product.entity';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { MeasurementUnit } from '@backend/src/modules/products/entities/measurement-unit.enum';

interface ProductsTableProps {
  products: Product[];
}

const ITEMS_PER_PAGE = 5;

const UNIT_ABBREVIATIONS: Record<MeasurementUnit, string> = {
  [MeasurementUnit.GRAM]: 'g',
  [MeasurementUnit.UNIT]: '',
  [MeasurementUnit.LITER]: 'L',
  [MeasurementUnit.KILOGRAM]: 'kg',
  [MeasurementUnit.MILLILITER]: 'ml',
  [MeasurementUnit.PACK]: 'pack',
  [MeasurementUnit.OTHER]: '',
};

// Thresholds from environment variables
const CRITICAL_THRESHOLD = Number(process.env.NEXT_PUBLIC_CRITICAL_STOCK_THRESHOLD || 20);
const WARNING_THRESHOLD = Number(process.env.NEXT_PUBLIC_WARNING_STOCK_THRESHOLD || 40);
const OPTIMAL_STOCK_DAYS = Number(process.env.NEXT_PUBLIC_OPTIMAL_STOCK_DAYS || 10);

// Helper to calculate stock health percentage
function calculateStockHealth(product: Product): number {
  const optimalStock = Number(product.dailyConsumption) * OPTIMAL_STOCK_DAYS;
  if (optimalStock === 0) return 100; // Edge case
  return (Number(product.estimatedStock) / optimalStock) * 100;
}

export default function ProductsTable({ products }: ProductsTableProps) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [onlyCritical, setOnlyCritical] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesSearch = product.name.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = categoryFilter === 'ALL' || product.category === categoryFilter;

      // Backend criticalStock is a number (threshold).
      // Frontend logic: isCritical if estimatedStock <= criticalStock
      // Ensure we parse numbers just in case they come as strings from JSON
      const isCritical = Number(product.estimatedStock) <= Number(product.criticalStock);
      const matchesCritical = !onlyCritical || isCritical;

      return matchesSearch && matchesCategory && matchesCritical;
    });
  }, [products, search, categoryFilter, onlyCritical]);

  const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);
  const paginatedProducts = filteredProducts.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  // Reset page when filters change
  useMemo(() => {
    setCurrentPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, categoryFilter, onlyCritical]);

  return (
    <div className="space-y-4">
      <div className="flex flex-row items-center justify-between gap-2">
        <Input
          placeholder="Buscar producto..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-[120px] sm:w-[152px] text-xs"
        />

        <div className="flex items-center gap-2 sm:gap-4">
          <div className="flex flex-col items-center gap-1">
            <Label
              htmlFor="critical-mode"
              className="text-xs sm:text-sm font-medium text-muted-foreground leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 "
            >
              Críticos
            </Label>
            <Switch
              id="critical-mode"
              checked={onlyCritical}
              onCheckedChange={setOnlyCritical}
              className="scale-90 sm:scale-100"
            />
          </div>

          <div className="flex items-center">
            <Select value={categoryFilter} onValueChange={(value) => setCategoryFilter(value)}>
              <SelectTrigger className="w-[70px] sm:w-[180px] h-9 px-2 text-lg sm:text-sm flex items-center justify-center">
                <SelectValue placeholder="Categoría">
                  {categoryFilter === 'ALL' ? (
                    <span className="md:hidden text-sm font-medium text-muted-foreground flex items-center h-full">
                      Todos
                    </span>
                  ) : (
                    <span className="md:hidden">{CategoryEmojis[categoryFilter as Category] || categoryFilter}</span>
                  )}
                  <span className="hidden md:inline">{categoryFilter === 'ALL' ? 'Todas' : categoryFilter}</span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">
                  <span className="sm:hidden text-sm">Todos</span>
                  <span className="hidden sm:inline">Todos</span>
                </SelectItem>
                {Object.values(Category).map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    <div className="flex items-center gap-2">
                      <span>{CategoryEmojis[cat]}</span>
                      <span className="hidden sm:inline">{cat}</span>
                      <span className="sm:hidden text-xs">{cat.substring(0, 3)}..</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead>Categoría</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedProducts.length > 0 ? (
              paginatedProducts.map((product) => {
                const health = calculateStockHealth(product);
                let rowClass = 'bg-green-50 hover:bg-green-100'; // Default Green

                // Backend critical logic
                const isCritical = Number(product.estimatedStock) <= Number(product.criticalStock);

                // Color logic using env thresholds AND critical flag from backend
                if (isCritical || health < CRITICAL_THRESHOLD) {
                  rowClass = 'bg-red-50 hover:bg-red-100';
                } else if (health >= CRITICAL_THRESHOLD && health <= WARNING_THRESHOLD) {
                  rowClass = 'bg-orange-50 hover:bg-orange-100';
                }

                return (
                  <TableRow key={product.id} className={rowClass}>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell>
                      {Number(product.estimatedStock)} {UNIT_ABBREVIATIONS[product.measurementUnit]}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span>{CategoryEmojis[product.category as Category] || '📦'}</span>
                        <span className="text-xs text-muted-foreground md:text-sm">{product.category}</span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                  No se encontraron productos.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between px-2">
        <div className="text-sm text-muted-foreground">
          Página {currentPage} de {totalPages || 1}
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages || totalPages === 0}
          >
            Siguiente
          </Button>
        </div>
      </div>
    </div>
  );
}
