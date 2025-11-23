'use client';

import { useState, useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
// eslint-disable-next-line @nx/enforce-module-boundaries
import type { UserProduct } from '@backend/src/modules/user-products/entities/user-product.entity';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { MeasurementUnit } from '@backend/src/modules/products/entities/measurement-unit.enum';

interface ProductsTableProps {
  products: UserProduct[];
  selectedProductId?: string | null;
  onSelectProduct?: (id: string) => void;
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
function calculateStockHealth(userProduct: UserProduct): number {
  const dailyConsumption = Number(userProduct.dailyConsumption);
  const estimatedStock = Number(userProduct.estimatedStock);
  const optimalStock = dailyConsumption * OPTIMAL_STOCK_DAYS;

  if (optimalStock === 0) return 100; // Edge case
  return (estimatedStock / optimalStock) * 100;
}

export default function ProductsTable({ products, selectedProductId, onSelectProduct }: ProductsTableProps) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [onlyCritical, setOnlyCritical] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  // Extract unique categories from products for the filter
  const uniqueCategories = useMemo(() => {
    const categories = new Map<string, string>(); // Name -> Emoji
    products.forEach((p) => {
      if (p.product?.category) {
        categories.set(p.product.category.name, p.product.category.emoji);
      }
    });
    return Array.from(categories.entries()).map(([name, emoji]) => ({ name, emoji }));
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter((userProduct) => {
      const product = userProduct.product;
      if (!product) return false;

      const matchesSearch = product.name.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = categoryFilter === 'ALL' || product.category?.name === categoryFilter;

      const isCritical = Number(userProduct.estimatedStock) <= Number(userProduct.criticalStock);
      const matchesCritical = !onlyCritical || isCritical;

      return matchesSearch && matchesCategory && matchesCritical;
    });
  }, [products, search, categoryFilter, onlyCritical]);

  const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);
  const paginatedProducts = filteredProducts.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

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
              <SelectTrigger className="w-[90px] sm:w-[180px] h-9 px-2 text-sm flex items-center justify-center">
                <SelectValue placeholder="Categoría">
                  {categoryFilter === 'ALL' ? (
                    <span className="text-sm font-medium text-muted-foreground flex items-center h-full">Todos</span>
                  ) : (
                    <div className="flex items-center gap-1">
                      <span>{uniqueCategories.find((c) => c.name === categoryFilter)?.emoji}</span>
                      <span className="text-sm">{categoryFilter}</span>
                    </div>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">
                  <span className="text-sm">Todos</span>
                </SelectItem>
                {uniqueCategories.map((cat) => (
                  <SelectItem key={cat.name} value={cat.name}>
                    <div className="flex items-center gap-2">
                      <span>{cat.emoji}</span>
                      <span className="text-sm">{cat.name}</span>
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
              paginatedProducts.map((userProduct) => {
                const product = userProduct.product;
                const health = calculateStockHealth(userProduct);
                let rowClass = 'bg-green-50 hover:bg-green-100';

                const isCritical = Number(userProduct.estimatedStock) <= Number(userProduct.criticalStock);

                if (isCritical || health < CRITICAL_THRESHOLD) {
                  rowClass = 'bg-red-50 hover:bg-red-100';
                } else if (health >= CRITICAL_THRESHOLD && health <= WARNING_THRESHOLD) {
                  rowClass = 'bg-orange-50 hover:bg-orange-100';
                }

                const isSelected = selectedProductId === userProduct.id;

                // Override styles if selected
                if (isSelected) {
                  rowClass = 'bg-blue-100 hover:bg-blue-200 !border-l-4 border-l-blue-500';
                }

                return (
                  <TableRow
                    key={userProduct.id}
                    className={cn(rowClass, 'cursor-pointer transition-colors relative')}
                    onClick={() => {
                      if (onSelectProduct) {
                        onSelectProduct(userProduct.id);
                      }
                    }}
                  >
                    <TableCell className="font-medium">{product?.name}</TableCell>
                    <TableCell>
                      {Number(userProduct.estimatedStock)} {product?.unit ? UNIT_ABBREVIATIONS[product.unit] : ''}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span>{product?.category?.emoji || '📦'}</span>
                        <span className="text-xs text-muted-foreground md:text-sm">{product?.category?.name}</span>
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
