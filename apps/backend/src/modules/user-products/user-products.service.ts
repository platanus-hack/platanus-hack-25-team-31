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

    // Paso 2: Crear DataLoad para este batch
    const dataLoad = this.dataLoadRepository.create({
      userId,
      sourceType: dto.sourceType,
      loadDate: new Date(),
    });
    const savedDataLoad = await this.dataLoadRepository.save(dataLoad);
    this.logger.log(`DataLoad creado: ${savedDataLoad.id}`);

    // Paso 3: Validar todos los productos en paralelo con Claude
    const rawItems: RawItemInput[] = dto.products.map((productInput) => ({
      name: productInput.name,
      quantity: productInput.quantity,
      measurementUnit: productInput.measurementUnit,
      sourceText: productInput.sourceText,
    }));

    let validatedItems: Awaited<ReturnType<typeof this.claudeService.validateItems>>;
    try {
      validatedItems = await this.claudeService.validateItems(rawItems);
      this.logger.log(`Validación completada: ${validatedItems.length} items validados`);
    } catch (error) {
      const errorMessage = `Error validando items con Claude: ${error.message}`;
      this.logger.error(errorMessage, error.stack);
      errors.push(errorMessage);
      return {
        dataLoadId: savedDataLoad.id,
        itemsProcessed: 0,
        itemsCreated: 0,
        errors,
      };
    }

    // Filtrar items válidos (excluir los que tienen errores críticos)
    const validItems = validatedItems.filter(
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

    // Paso 4: Obtener todos los productos existentes en una sola query
    const uniqueProductNames = [...new Set(validItems.map((item) => item.name))];
    const existingProducts = await this.productRepository
      .createQueryBuilder('product')
      .where('LOWER(product.name) IN (:...names)', {
        names: uniqueProductNames.map((name) => name.toLowerCase()),
      })
      .getMany();

    // Crear mapa de productos por nombre (case-insensitive)
    const productMap = new Map<string, Product>();
    existingProducts.forEach((product) => {
      productMap.set(product.name.toLowerCase(), product);
    });

    // Identificar productos nuevos
    const newProductNames = uniqueProductNames.filter(
      (name) => !productMap.has(name.toLowerCase()),
    );

    // Paso 5: Inferir categorías para productos nuevos en paralelo
    const categoryPromises = newProductNames.map((productName) =>
      this.claudeService.inferCategory(productName, existingCategories).catch((error) => {
        this.logger.error(`Error infiriendo categoría para "${productName}": ${error.message}`);
        return { name: 'Otros', emoji: '📦' }; // Fallback
      }),
    );

    const categoryInfos = await Promise.all(categoryPromises);

    // Paso 6: Procesar categorías (buscar existentes y crear nuevas en batch)
    const categoryMap = new Map<string, Category>();
    existingCategories.forEach((cat) => {
      categoryMap.set(cat.name.toLowerCase(), cat);
    });

    // Identificar categorías nuevas (deduplicadas)
    const newCategoryInfos = categoryInfos.filter(
      (info, index, self) =>
        index === self.findIndex((i) => i.name.toLowerCase() === info.name.toLowerCase()),
    );

    const categoriesToCreate: Category[] = [];
    for (const categoryInfo of newCategoryInfos) {
      if (!categoryMap.has(categoryInfo.name.toLowerCase())) {
        categoriesToCreate.push(
          this.categoryRepository.create({
            name: categoryInfo.name,
            emoji: categoryInfo.emoji,
          }),
        );
      }
    }

    // Crear categorías nuevas en batch
    if (categoriesToCreate.length > 0) {
      const savedCategories = await this.categoryRepository.save(categoriesToCreate);
      savedCategories.forEach((cat) => {
        categoryMap.set(cat.name.toLowerCase(), cat);
        this.logger.log(`Nueva categoría creada: ${cat.name} ${cat.emoji}`);
      });
    }

    // Paso 7: Crear productos nuevos en batch
    const productsToCreate: Product[] = [];
    const productNameToCategoryInfo = new Map<string, { name: string; emoji: string }>();
    newProductNames.forEach((productName, index) => {
      productNameToCategoryInfo.set(productName.toLowerCase(), categoryInfos[index]);
    });

    for (const productName of newProductNames) {
      const validatedItem = validItems.find((item) => item.name === productName);
      if (!validatedItem) continue;

      const categoryInfo = productNameToCategoryInfo.get(productName.toLowerCase());
      if (!categoryInfo) continue;

      const category = categoryMap.get(categoryInfo.name.toLowerCase());
      if (!category) continue;

      productsToCreate.push(
        this.productRepository.create({
          name: productName,
          unit: validatedItem.measurementUnit,
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
    const productIds = validItems.map((item) => {
      const product = productMap.get(item.name.toLowerCase());
      return product?.id;
    }).filter((id): id is string => !!id);

    const existingUserProducts = productIds.length > 0
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

    // Identificar UserProducts que necesitan ser creados
    const userProductsToCreate: UserProduct[] = [];
    for (const validatedItem of validItems) {
      const product = productMap.get(validatedItem.name.toLowerCase());
      if (!product) {
        errors.push(`Producto "${validatedItem.name}" no encontrado después de la creación`);
        continue;
      }

      if (!userProductMap.has(product.id)) {
        userProductsToCreate.push(
          this.userProductRepository.create({
            userId,
            productId: product.id,
            estimatedStock: 0,
            dailyConsumption: 0,
            criticalStock: 0,
            quantity: 0,
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

    // Inicializar cambios con las cantidades actuales
    userProductMap.forEach((userProduct) => {
      userProductQuantityChanges.set(userProduct.id, {
        currentQuantity: Number(userProduct.quantity),
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
            quantityChange.lastAdjustment = validatedItem.quantity;
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
      const userProductsToUpdateArray = Array.from(userProductQuantityChanges.entries())
        .map(([id, change]) => {
          const userProduct = userProductMap.get(id);
          if (!userProduct) return null;

          // Calcular cantidad final: si hay adjustment, usar ese valor; sino, usar acumulado
          const finalQuantity =
            change.lastAdjustment !== null
              ? change.lastAdjustment
              : change.currentQuantity + change.accumulatedChange;

          userProduct.quantity = Math.max(0, finalQuantity);
          return userProduct;
        })
        .filter((up): up is UserProduct => up !== null);

      if (userProductsToUpdateArray.length > 0) {
        await this.userProductRepository.save(userProductsToUpdateArray);
        this.logger.log(`${userProductsToUpdateArray.length} UserProducts actualizados`);
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
}
