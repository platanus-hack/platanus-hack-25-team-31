import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { UserProduct } from './entities/user-product.entity';
import { Product } from '../products/entities/product.entity';
import { Category } from '../categories/entities/category.entity';
import { DataLoad } from '../data-loads/entities/data-load.entity';
import { DataLoadItems } from '../data-load-items/entities/data-load-items.entity';
import { InventoryMovement, MovementType } from '../inventory-movements/entities/inventory-movement.entity';
import { ClaudeService, RawItemInput } from '../claude/claude.service';
import { BulkUploadDto } from './dto/bulk-upload.dto';

interface BuyProductResponse {
  name: string;
  category: string;
  estimatedStock: number;
  recommendedBuyQuantity: number;
  unit: string;
}

interface AgentAllProductResponse {
  name: string;
  category: string;
  estimatedStock: number;
  dailyConsumption: number;
  criticalStock: number;
  unit: string;
}

@Injectable()
export class UserProductsService {
  private readonly logger = new Logger(UserProductsService.name);

  constructor(
    @InjectRepository(UserProduct)
    private readonly userProductRepository: Repository<UserProduct>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    @InjectRepository(DataLoad)
    private readonly dataLoadRepository: Repository<DataLoad>,
    @InjectRepository(DataLoadItems)
    private readonly dataLoadItemsRepository: Repository<DataLoadItems>,
    @InjectRepository(InventoryMovement)
    private readonly inventoryMovementRepository: Repository<InventoryMovement>,
    @Inject(forwardRef(() => ClaudeService))
    private readonly claudeService: ClaudeService,
  ) {}

  async getBuyProducts(userId: string): Promise<BuyProductResponse[]> {
    // Get purchase duration days from environment variable, default to 10
    const purchaseDurationDays = parseInt(process.env.PURCHASE_DURATION_DAYS || '10', 10);

    // Query user products with filter applied in SQL query
    // Filter: estimatedStock < dailyConsumption * purchaseDurationDays
    const userProducts = await this.userProductRepository
      .createQueryBuilder('userProduct')
      .leftJoinAndSelect('userProduct.product', 'product')
      .leftJoinAndSelect('product.category', 'category')
      .where('userProduct.userId = :userId', { userId })
      .andWhere('userProduct.estimated_stock < userProduct.daily_consumption * :purchaseDurationDays', {
        purchaseDurationDays,
      })
      .getMany();

    // Map to response format
    return userProducts.map((userProduct) => {
      const targetStock = Number(userProduct.dailyConsumption) * purchaseDurationDays;
      const recommendedBuyQuantity = targetStock - Number(userProduct.estimatedStock);

      return {
        name: userProduct.product.name,
        category: userProduct.product.category.name,
        estimatedStock: Number(userProduct.estimatedStock),
        recommendedBuyQuantity: parseFloat(Math.max(0, recommendedBuyQuantity).toFixed(2)),
        unit: userProduct.product.unit,
      };
    });
  }

  async getAllProductsForAgent(userId: string): Promise<AgentAllProductResponse[]> {
    // Query all user products with product and category relations
    const userProducts = await this.userProductRepository.find({
      where: { userId },
      relations: ['product', 'product.category'],
    });

    // Map to response format
    return userProducts.map((userProduct) => {
      return {
        name: userProduct.product.name,
        category: userProduct.product.category.name,
        estimatedStock: Number(userProduct.estimatedStock),
        dailyConsumption: Number(userProduct.dailyConsumption),
        criticalStock: Number(userProduct.criticalStock),
        unit: userProduct.product.unit,
      };
    });
  }

  /**
   * Procesa un bulk upload de productos (versión optimizada con procesamiento en paralelo)
   */
  async bulkUpload(
    userId: string,
    dto: BulkUploadDto,
  ): Promise<{
    dataLoadId: string;
    itemsProcessed: number;
    itemsCreated: number;
    errors: string[];
  }> {
    this.logger.log(`Procesando bulk upload para usuario ${userId}: ${dto.products.length} productos`);

    const errors: string[] = [];
    let itemsProcessed = 0;
    let itemsCreated = 0;

    // Paso 1: Obtener todas las categorías existentes
    const existingCategories = await this.categoryRepository.find();
    this.logger.log(`Categorías existentes: ${existingCategories.length}`);

    // Paso 2: Obtener todos los productos existentes para búsqueda de similares
    const existingProducts = await this.productRepository.find();
    this.logger.log(`Productos existentes: ${existingProducts.length}`);

    // Paso 3: Crear DataLoad para este batch
    const dataLoad = this.dataLoadRepository.create({
      userId,
      sourceType: dto.sourceType,
      loadDate: new Date(),
    });
    const savedDataLoad = await this.dataLoadRepository.save(dataLoad);
    this.logger.log(`DataLoad creado: ${savedDataLoad.id}`);

    // Paso 4: Procesar todos los productos en batch con Claude
    // Esto valida y normaliza nombre, unidad, cantidad e infiere categoría en una sola llamada por batch
    const rawItems: RawItemInput[] = dto.products.map((productInput) => ({
      name: productInput.name,
      quantity: productInput.quantity,
      measurementUnit: productInput.measurementUnit,
      sourceText: productInput.sourceText,
    }));

    let processedItems: Awaited<ReturnType<typeof this.claudeService.processItemsBatch>>;
    try {
      processedItems = await this.claudeService.processItemsBatch(rawItems, existingCategories, existingProducts);
      this.logger.log(`Procesamiento con Claude completado: ${processedItems.length} items`);
    } catch (error) {
      const errorMessage = `Error procesando items con Claude: ${error.message}`;
      this.logger.error(errorMessage, error.stack);
      errors.push(errorMessage);
      return {
        dataLoadId: savedDataLoad.id,
        itemsProcessed: 0,
        itemsCreated: 0,
        errors,
      };
    }

    // Filtrar items válidos
    const validItems = processedItems.filter(
      (item) => !(item.confidence === 'low' && item.conversionNote?.includes('Error')),
    );
    itemsProcessed = validItems.length;

    if (validItems.length === 0) {
      this.logger.warn('No hay items válidos para procesar');
      return {
        dataLoadId: savedDataLoad.id,
        itemsProcessed: 0,
        itemsCreated: 0,
        errors: [...errors, 'No hay items válidos para procesar'],
      };
    }

    // Paso 5: Obtener todos los productos existentes que coincidan con los nombres procesados
    const uniqueProductNames = [...new Set(validItems.map((item) => item.name))];
    const matchingProducts = await this.productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .where('LOWER(product.name) IN (:...names)', {
        names: uniqueProductNames.map((name) => name.toLowerCase()),
      })
      .getMany();

    // Crear mapa de productos por nombre (case-insensitive)
    const productMap = new Map<string, Product>();
    matchingProducts.forEach((product) => {
      productMap.set(product.name.toLowerCase(), product);
    });

    // Paso 6: Procesar categorías (buscar existentes y crear nuevas en batch)
    const categoryMap = new Map<string, Category>();
    existingCategories.forEach((cat) => {
      categoryMap.set(cat.name.toLowerCase(), cat);
    });

    // Identificar categorías nuevas necesarias
    const categoriesToCreate = new Map<string, { name: string; emoji: string }>();

    validItems.forEach((item) => {
      // Si el producto existe, usaremos su categoría existente
      if (productMap.has(item.name.toLowerCase())) return;

      // Si la categoría ya existe en BD, no necesitamos crearla
      if (categoryMap.has(item.categoryName.toLowerCase())) return;

      // Si no existe ni el producto ni la categoría, hay que crear la categoría
      categoriesToCreate.set(item.categoryName.toLowerCase(), {
        name: item.categoryName,
        emoji: item.categoryEmoji,
      });
    });

    // Crear categorías nuevas en batch
    if (categoriesToCreate.size > 0) {
      const newCategories = Array.from(categoriesToCreate.values()).map((info) =>
        this.categoryRepository.create({
          name: info.name,
          emoji: info.emoji,
        }),
      );

      const savedCategories = await this.categoryRepository.save(newCategories);
      savedCategories.forEach((cat) => {
        categoryMap.set(cat.name.toLowerCase(), cat);
        this.logger.log(`Nueva categoría creada: ${cat.name} ${cat.emoji}`);
      });
    }

    // Paso 7: Crear productos nuevos en batch
    const productsToCreate: Product[] = [];
    const newProductNames = uniqueProductNames.filter((name) => !productMap.has(name.toLowerCase()));

    for (const productName of newProductNames) {
      // Buscar el item procesado correspondiente para obtener datos
      const processedItem = validItems.find((item) => item.name === productName);
      if (!processedItem) continue;

      const category = categoryMap.get(processedItem.categoryName.toLowerCase());
      if (!category) {
        // Fallback a categoría "Otros" si no se encuentra (aunque debería existir ya)
        const fallbackCategory = categoryMap.get('otros') || Array.from(categoryMap.values())[0];
        if (fallbackCategory) {
          productsToCreate.push(
            this.productRepository.create({
              name: productName,
              unit: processedItem.measurementUnit,
              categoryId: fallbackCategory.id,
            }),
          );
        }
        continue;
      }

      productsToCreate.push(
        this.productRepository.create({
          name: productName,
          unit: processedItem.measurementUnit,
          categoryId: category.id,
        }),
      );
    }

    if (productsToCreate.length > 0) {
      const savedProducts = await this.productRepository.save(productsToCreate);
      savedProducts.forEach((product) => {
        productMap.set(product.name.toLowerCase(), product);
        this.logger.log(`Nuevo producto creado: ${product.name}`);
      });
      itemsCreated = savedProducts.length;
    }

    // Paso 8: Obtener todos los UserProducts existentes en una sola query
    const productIds = validItems
      .map((item) => {
        const product = productMap.get(item.name.toLowerCase());
        return product?.id;
      })
      .filter((id): id is string => !!id);

    const existingUserProducts =
      productIds.length > 0
        ? await this.userProductRepository.find({
            where: {
              userId,
              productId: In(productIds),
            },
          })
        : [];

    // Crear mapa de UserProducts por productId
    const userProductMap = new Map<string, UserProduct>();
    existingUserProducts.forEach((up) => {
      userProductMap.set(up.productId, up);
    });

    // Calcular cantidad total por producto para movimientos IN y ADJUSTMENT (necesario para nuevos UserProducts)
    const productTotalQuantities = new Map<string, number>();
    if (dto.movementType === MovementType.IN || dto.movementType === MovementType.ADJUSTMENT) {
      validItems.forEach((item) => {
        const product = productMap.get(item.name.toLowerCase());
        if (product) {
          if (dto.movementType === MovementType.IN) {
            // Para IN, sumar todas las cantidades del mismo producto
            const currentTotal = productTotalQuantities.get(product.id) || 0;
            productTotalQuantities.set(product.id, currentTotal + item.quantity);
          } else if (dto.movementType === MovementType.ADJUSTMENT) {
            // Para ADJUSTMENT, usar el último valor (como se hace en el Paso 9)
            // Si hay múltiples adjustments del mismo producto, solo el último cuenta
            productTotalQuantities.set(product.id, item.quantity);
          }
        }
      });
    }

    // Identificar UserProducts que necesitan ser creados
    const userProductsToCreate: UserProduct[] = [];
    for (const validatedItem of validItems) {
      const product = productMap.get(validatedItem.name.toLowerCase());
      if (!product) {
        errors.push(`Producto "${validatedItem.name}" no encontrado después de la creación`);
        continue;
      }

      if (!userProductMap.has(product.id)) {
        // Para productos nuevos con movimiento IN, calcular dailyConsumption y criticalStock
        // El estimatedStock se calculará después en el Paso 9 cuando se procesen los movimientos
        let dailyConsumption = 0;
        let criticalStock = 0;

        if (dto.movementType !== MovementType.OUT) {
          const totalQuantity = productTotalQuantities.get(product.id) || 0;
          if (totalQuantity > 0) {
            // Asumir que la compra durará una semana (7 días)
            dailyConsumption = parseFloat((totalQuantity / 7).toFixed(2));
            // Critical stock es cuando solo quedan 2 días más
            criticalStock = parseFloat((dailyConsumption * 2).toFixed(2));
          }
        }

        userProductsToCreate.push(
          this.userProductRepository.create({
            userId,
            productId: product.id,
            estimatedStock: 0, // Se calculará después en el Paso 9
            dailyConsumption,
            criticalStock,
          }),
        );
      }
    }

    // Crear UserProducts nuevos en batch
    if (userProductsToCreate.length > 0) {
      const savedUserProducts = await this.userProductRepository.save(userProductsToCreate);
      savedUserProducts.forEach((up) => {
        userProductMap.set(up.productId, up);
        this.logger.log(`Nuevo UserProduct creado para usuario ${userId}`);
      });
    }

    // Paso 9: Preparar todas las entidades para batch insert
    const dataLoadItemsToCreate: DataLoadItems[] = [];
    const inventoryMovementsToCreate: InventoryMovement[] = [];
    // Map para acumular cambios de cantidad por UserProduct
    // Key: userProductId, Value: { currentQuantity, accumulatedChange, lastAdjustment }
    const userProductQuantityChanges = new Map<
      string,
      { currentQuantity: number; accumulatedChange: number; lastAdjustment: number | null }
    >();

    // Inicializar cambios con las cantidades actuales de TODOS los UserProducts
    // (incluyendo los que se acaban de crear)
    userProductMap.forEach((userProduct) => {
      userProductQuantityChanges.set(userProduct.id, {
        currentQuantity: Number(userProduct.estimatedStock),
        accumulatedChange: 0,
        lastAdjustment: null,
      });
    });

    for (const validatedItem of validItems) {
      try {
        const product = productMap.get(validatedItem.name.toLowerCase());
        if (!product) {
          errors.push(`Producto "${validatedItem.name}" no encontrado`);
          continue;
        }

        const userProduct = userProductMap.get(product.id);
        if (!userProduct) {
          errors.push(`UserProduct no encontrado para producto "${validatedItem.name}"`);
          continue;
        }

        // Crear DataLoadItem
        dataLoadItemsToCreate.push(
          this.dataLoadItemsRepository.create({
            dataLoadId: savedDataLoad.id,
            userProductId: userProduct.id,
            quantity: validatedItem.quantity,
          }),
        );

        // Acumular cambios según movementType
        const quantityChange = userProductQuantityChanges.get(userProduct.id);
        if (!quantityChange) {
          errors.push(`Cambio de cantidad no inicializado para UserProduct ${userProduct.id}`);
          continue;
        }

        let stockAfter: number;
        switch (dto.movementType) {
          case MovementType.IN:
            quantityChange.accumulatedChange += validatedItem.quantity;
            stockAfter = quantityChange.currentQuantity + quantityChange.accumulatedChange;
            break;
          case MovementType.OUT:
            quantityChange.accumulatedChange -= validatedItem.quantity;
            stockAfter = Math.max(0, quantityChange.currentQuantity + quantityChange.accumulatedChange);
            break;
          case MovementType.ADJUSTMENT:
            // Para ADJUSTMENT, cada item establece el valor absoluto
            // Si hay múltiples adjustments del mismo producto, solo el último cuenta
            quantityChange.lastAdjustment = validatedItem.quantity;
            quantityChange.accumulatedChange = 0; // Reset accumulated change cuando hay adjustment
            stockAfter = validatedItem.quantity;
            break;
          default:
            stockAfter = quantityChange.currentQuantity;
        }

        // Crear InventoryMovement
        inventoryMovementsToCreate.push(
          this.inventoryMovementRepository.create({
            userProductId: userProduct.id,
            movementType: dto.movementType,
            quantity: validatedItem.quantity,
            stockAfter,
            sourceLoadId: savedDataLoad.id,
          }),
        );
      } catch (error) {
        const errorMessage = `Error preparando entidades para "${validatedItem.name}": ${error.message}`;
        this.logger.error(errorMessage, error.stack);
        errors.push(errorMessage);
      }
    }

    // Paso 10: Batch insert de DataLoadItems e InventoryMovements
    try {
      if (dataLoadItemsToCreate.length > 0) {
        await this.dataLoadItemsRepository.save(dataLoadItemsToCreate);
        this.logger.log(`${dataLoadItemsToCreate.length} DataLoadItems creados`);
      }

      if (inventoryMovementsToCreate.length > 0) {
        await this.inventoryMovementRepository.save(inventoryMovementsToCreate);
        this.logger.log(`${inventoryMovementsToCreate.length} InventoryMovements creados`);
      }
    } catch (error) {
      const errorMessage = `Error en batch insert: ${error.message}`;
      this.logger.error(errorMessage, error.stack);
      errors.push(errorMessage);
    }

    // Paso 11: Batch update de UserProducts
    try {
      // Verificar que todos los UserProducts que tienen items procesados estén en el mapa de cambios
      const processedUserProductIds = new Set<string>();
      validItems.forEach((item) => {
        const product = productMap.get(item.name.toLowerCase());
        if (product) {
          const userProduct = userProductMap.get(product.id);
          if (userProduct) {
            processedUserProductIds.add(userProduct.id);
          }
        }
      });

      // Asegurar que todos los UserProducts procesados estén inicializados en el mapa de cambios
      processedUserProductIds.forEach((userProductId) => {
        if (!userProductQuantityChanges.has(userProductId)) {
          const userProduct = Array.from(userProductMap.values()).find((up) => up.id === userProductId);
          if (userProduct) {
            userProductQuantityChanges.set(userProductId, {
              currentQuantity: Number(userProduct.estimatedStock),
              accumulatedChange: 0,
              lastAdjustment: null,
            });
            this.logger.warn(
              `UserProduct ${userProductId} no estaba en userProductQuantityChanges, inicializado ahora`,
            );
          }
        }
      });

      const userProductsToUpdateArray = Array.from(userProductQuantityChanges.entries())
        .map(([id, change]) => {
          // Buscar UserProduct por su id (no por productId)
          const userProduct = Array.from(userProductMap.values()).find((up) => up.id === id);
          if (!userProduct) {
            this.logger.warn(`UserProduct con id ${id} no encontrado en userProductMap`);
            return null;
          }

          // Calcular cantidad final: si hay adjustment, usar ese valor; sino, usar acumulado
          const finalQuantity =
            change.lastAdjustment !== null ? change.lastAdjustment : change.currentQuantity + change.accumulatedChange;

          const previousStock = Number(userProduct.estimatedStock);
          userProduct.estimatedStock = Math.max(0, finalQuantity);

          // Log para debugging
          if (previousStock !== Number(userProduct.estimatedStock)) {
            this.logger.log(
              `UserProduct ${id}: ${previousStock} -> ${userProduct.estimatedStock} (change: ${change.accumulatedChange}, adjustment: ${change.lastAdjustment})`,
            );
          }

          return userProduct;
        })
        .filter((up): up is UserProduct => up !== null);

      if (userProductsToUpdateArray.length > 0) {
        await this.userProductRepository.save(userProductsToUpdateArray);
        this.logger.log(`${userProductsToUpdateArray.length} UserProducts actualizados`);
      } else {
        this.logger.warn('No hay UserProducts para actualizar');
      }
    } catch (error) {
      const errorMessage = `Error actualizando UserProducts: ${error.message}`;
      this.logger.error(errorMessage, error.stack);
      errors.push(errorMessage);
    }

    this.logger.log(
      `Bulk upload completado: ${itemsProcessed} procesados, ${itemsCreated} productos nuevos, ${errors.length} errores`,
    );

    return {
      dataLoadId: savedDataLoad.id,
      itemsProcessed,
      itemsCreated,
      errors,
    };
  }

  /**
   * Reduce el stock diario de todos los productos usando una query SQL eficiente.
   * Reduce estimated_stock en daily_consumption, asegurándose de que nunca sea menor a 0.
   * Crea los movimientos de inventario correspondientes para cada producto que tuvo consumo.
   */
  async reduceDailyStock(): Promise<{
    productsUpdated: number;
    movementsCreated: number;
  }> {
    this.logger.log('Iniciando reducción diaria de stock para todos los productos');

    // Primero obtener todos los productos que serán actualizados (antes del update)
    const productsToUpdate = await this.userProductRepository
      .createQueryBuilder('up')
      .where('up.daily_consumption > 0')
      .getMany();

    // Preparar movimientos de inventario con los valores antes del update
    const movementsToCreate: InventoryMovement[] = [];

    for (const product of productsToUpdate) {
      const dailyConsumption = Number(product.dailyConsumption);
      const previousStock = Number(product.estimatedStock);
      const newStock = Math.max(0, previousStock - dailyConsumption);

      // Crear movimiento para todos los productos con consumo diario > 0
      // El movimiento representa el consumo diario esperado, incluso si el stock llega a 0
      movementsToCreate.push(
        this.inventoryMovementRepository.create({
          userProductId: product.id,
          movementType: MovementType.OUT,
          quantity: dailyConsumption,
          stockAfter: newStock,
          sourceLoadId: null, // No tiene sourceLoad porque es consumo automático diario
        }),
      );
    }

    // Query SQL para actualizar todos los productos de una vez
    // Solo actualiza productos con daily_consumption > 0
    const updateResult = await this.userProductRepository
      .createQueryBuilder()
      .update(UserProduct)
      .set({
        estimatedStock: () => `GREATEST(0, estimated_stock - daily_consumption)`, // GREATEST asegura que nunca sea menor a 0
      })
      .where('daily_consumption > 0')
      .execute();

    const productsUpdated = updateResult.affected || 0;
    this.logger.log(`${productsUpdated} productos actualizados`);

    // Crear movimientos en batch
    let movementsCreated = 0;
    if (movementsToCreate.length > 0) {
      await this.inventoryMovementRepository.save(movementsToCreate);
      movementsCreated = movementsToCreate.length;
      this.logger.log(`${movementsCreated} movimientos de inventario creados`);
    }

    this.logger.log(
      `Reducción diaria de stock completada: ${productsUpdated} productos actualizados, ${movementsCreated} movimientos creados`,
    );

    return {
      productsUpdated,
      movementsCreated,
    };
  }
}
