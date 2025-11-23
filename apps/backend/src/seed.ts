import { AppDataSource } from './data-source';
import { User } from './modules/users/entities/user.entity';
import { Home } from './modules/homes/entities/home.entity';
import { Person } from './modules/people/entities/person.entity';
import { Product, MeasurementUnit } from './modules/products/entities/product.entity';
import { Category } from './modules/categories/entities/category.entity';
import { UserProduct } from './modules/user-products/entities/user-product.entity';
import { DataLoad, SourceType } from './modules/data-loads/entities/data-load.entity';
import { DataLoadItems } from './modules/data-load-items/entities/data-load-items.entity';
import { InventoryMovement, MovementType } from './modules/inventory-movements/entities/inventory-movement.entity';

async function seed() {
  await AppDataSource.initialize();
  console.log('Seeding database...');

  const userRepository = AppDataSource.getRepository(User);
  const homeRepository = AppDataSource.getRepository(Home);
  const personRepository = AppDataSource.getRepository(Person);
  const productRepository = AppDataSource.getRepository(Product);
  const categoryRepository = AppDataSource.getRepository(Category);
  const userProductRepository = AppDataSource.getRepository(UserProduct);
  const dataLoadRepository = AppDataSource.getRepository(DataLoad);
  const dataLoadItemsRepository = AppDataSource.getRepository(DataLoadItems);
  const inventoryMovementRepository = AppDataSource.getRepository(InventoryMovement);

  // Clear existing data using TRUNCATE CASCADE
  console.log('Clearing existing data...');
  await AppDataSource.query(`
    TRUNCATE TABLE 
      inventory_movements,
      data_load_items,
      data_loads,
      user_products,
      products,
      categories,
      people,
      homes,
      users
    CASCADE;
  `);

  const nextYear = new Date();
  nextYear.setFullYear(nextYear.getFullYear() + 1);

  // ========== CATEGORIES ==========
  const categoriesData = [
    { name: 'Granos', emoji: '🌾' },
    { name: 'Pasta', emoji: '🍝' },
    { name: 'Aceites', emoji: '🫒' },
    { name: 'Lácteos', emoji: '🥛' },
    { name: 'Endulzantes', emoji: '🍯' },
    { name: 'Condimentos', emoji: '🧂' },
    { name: 'Harinas', emoji: '🥡' },
    { name: 'Conservas', emoji: '🥫' },
    { name: 'Cereales', emoji: '🥣' },
    { name: 'Proteínas', emoji: '🍗' },
    { name: 'Carnes', emoji: '🥩' },
    { name: 'Legumbres', emoji: '🫘' },
    { name: 'Proteínas Vegetales', emoji: '🥬' },
    { name: 'Bebidas Vegetales', emoji: '🥥' },
    { name: 'Limpieza', emoji: '🧼' },
    { name: 'Higiene Personal', emoji: '🧴' },
    { name: 'Bebidas', emoji: '🥤' },
    { name: 'Snacks', emoji: '🍿' },
    { name: 'Panadería', emoji: '🥖' },
    { name: 'Congelados', emoji: '🧊' },
    { name: 'Frutas y Verduras', emoji: '🍎' },
  ];

  const categoryMap = new Map<string, Category>();
  for (const catData of categoriesData) {
    const cat = categoryRepository.create(catData);
    await categoryRepository.save(cat);
    categoryMap.set(cat.name, cat);
  }
  console.log(`Created ${categoriesData.length} categories`);

  // ========== PRODUCTS (Catalog) ==========
  const productsData = [
    { name: 'Arroz', unit: MeasurementUnit.KILOGRAM, category: 'Granos' },
    { name: 'Fideos', unit: MeasurementUnit.PACK, category: 'Pasta' },
    { name: 'Aceite', unit: MeasurementUnit.LITER, category: 'Aceites' },
    { name: 'Leche', unit: MeasurementUnit.LITER, category: 'Lácteos' },
    { name: 'Azúcar', unit: MeasurementUnit.KILOGRAM, category: 'Endulzantes' },
    { name: 'Sal', unit: MeasurementUnit.KILOGRAM, category: 'Condimentos' },
    { name: 'Harina', unit: MeasurementUnit.KILOGRAM, category: 'Harinas' },
    { name: 'Atún', unit: MeasurementUnit.UNIT, category: 'Conservas' },
    { name: 'Avena', unit: MeasurementUnit.KILOGRAM, category: 'Cereales' },
    { name: 'Quinoa', unit: MeasurementUnit.KILOGRAM, category: 'Granos' },
    { name: 'Aceite de Oliva', unit: MeasurementUnit.LITER, category: 'Aceites' },
    { name: 'Yogurt Griego', unit: MeasurementUnit.UNIT, category: 'Lácteos' },
    { name: 'Huevos', unit: MeasurementUnit.UNIT, category: 'Proteínas' },
    { name: 'Pollo', unit: MeasurementUnit.KILOGRAM, category: 'Carnes' },
    { name: 'Lentejas', unit: MeasurementUnit.KILOGRAM, category: 'Legumbres' },
    { name: 'Garbanzos', unit: MeasurementUnit.KILOGRAM, category: 'Legumbres' },
    { name: 'Tofu', unit: MeasurementUnit.UNIT, category: 'Proteínas Vegetales' },
    { name: 'Leche de Almendras', unit: MeasurementUnit.LITER, category: 'Bebidas Vegetales' },
    // New Products
    { name: 'Detergente Ropa', unit: MeasurementUnit.LITER, category: 'Limpieza' },
    { name: 'Lavaloza', unit: MeasurementUnit.MILLILITER, category: 'Limpieza' },
    { name: 'Papel Higiénico', unit: MeasurementUnit.PACK, category: 'Higiene Personal' },
    { name: 'Shampoo', unit: MeasurementUnit.MILLILITER, category: 'Higiene Personal' },
    { name: 'Pasta de Dientes', unit: MeasurementUnit.UNIT, category: 'Higiene Personal' },
    { name: 'Jabón', unit: MeasurementUnit.UNIT, category: 'Higiene Personal' },
    { name: 'Café', unit: MeasurementUnit.KILOGRAM, category: 'Bebidas' },
    { name: 'Té', unit: MeasurementUnit.PACK, category: 'Bebidas' },
    { name: 'Agua Mineral', unit: MeasurementUnit.LITER, category: 'Bebidas' },
    { name: 'Galletas', unit: MeasurementUnit.PACK, category: 'Snacks' },
    { name: 'Papas Fritas', unit: MeasurementUnit.PACK, category: 'Snacks' },
    { name: 'Pan Molde', unit: MeasurementUnit.UNIT, category: 'Panadería' },
    { name: 'Marraqueta', unit: MeasurementUnit.KILOGRAM, category: 'Panadería' },
    { name: 'Hamburguesas', unit: MeasurementUnit.PACK, category: 'Congelados' },
    { name: 'Verduras Congeladas', unit: MeasurementUnit.KILOGRAM, category: 'Congelados' },
    { name: 'Manzanas', unit: MeasurementUnit.KILOGRAM, category: 'Frutas y Verduras' },
    { name: 'Plátanos', unit: MeasurementUnit.KILOGRAM, category: 'Frutas y Verduras' },
    { name: 'Tomates', unit: MeasurementUnit.KILOGRAM, category: 'Frutas y Verduras' },
    { name: 'Lechuga', unit: MeasurementUnit.UNIT, category: 'Frutas y Verduras' },
    { name: 'Mantequilla', unit: MeasurementUnit.UNIT, category: 'Lácteos' },
    { name: 'Queso', unit: MeasurementUnit.KILOGRAM, category: 'Lácteos' },
    { name: 'Jamón', unit: MeasurementUnit.KILOGRAM, category: 'Carnes' },
    { name: 'Salsa de Tomate', unit: MeasurementUnit.UNIT, category: 'Conservas' },
    { name: 'Mermelada', unit: MeasurementUnit.UNIT, category: 'Endulzantes' },
    { name: 'Jugo Naranja', unit: MeasurementUnit.LITER, category: 'Bebidas' },
    { name: 'Cerveza', unit: MeasurementUnit.PACK, category: 'Bebidas' },
    { name: 'Vino', unit: MeasurementUnit.UNIT, category: 'Bebidas' },
    { name: 'Cloro', unit: MeasurementUnit.LITER, category: 'Limpieza' },
    { name: 'Esponjas', unit: MeasurementUnit.PACK, category: 'Limpieza' },
    { name: 'Bolsas de Basura', unit: MeasurementUnit.PACK, category: 'Limpieza' },
  ];

  const productMap = new Map<string, Product>();
  for (const prodData of productsData) {
    const product = productRepository.create({
      name: prodData.name,
      unit: prodData.unit,
      categoryId: categoryMap.get(prodData.category)?.id,
    });
    await productRepository.save(product);
    productMap.set(prodData.name, product);
  }
  console.log(`Created ${productsData.length} catalog products`);

  // ========== USERS ==========

  // USER 1: María
  const user1 = userRepository.create({
    phoneNumber: '+56912345678',
    name: 'María González',
    otpCode: '0000',
    otpExpiresAt: nextYear,
  });
  await userRepository.save(user1);

  // History Generator Helper
  async function generateHistory(
    userProductId: string,
    estimatedStockTarget: number, // Target stock approx
    dailyConsumption: number,
    days: number,
  ): Promise<number> {
    // Assume we start `days` ago with some stock
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    let currentStock = estimatedStockTarget + dailyConsumption * days * 0.5; // Start higher so we consume down

    // Ensure initial movement to set stock
    await inventoryMovementRepository.save({
      userProductId,
      movementType: MovementType.IN,
      quantity: currentStock,
      stockAfter: Number(currentStock.toFixed(2)),
      createdAt: startDate, // Backdate
    });

    const consumptionHour = Number(process.env.CONSUMPTION_HOUR || 10);

    for (let i = 1; i <= days; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      date.setHours(consumptionHour, 0, 0, 0); // Configurable time

      // Consumption
      const consume = Number((dailyConsumption * (0.8 + Math.random() * 0.4)).toFixed(2)); // +/- 20%
      if (currentStock >= consume) {
        currentStock -= consume;
        await inventoryMovementRepository.save({
          userProductId,
          movementType: MovementType.OUT,
          quantity: consume,
          stockAfter: Number(currentStock.toFixed(2)),
          createdAt: new Date(date), // Distinct time
        });
      }

      // Advance time
      date.setHours(consumptionHour + 4, 0, 0, 0);

      // Restock logic (if low)
      if (currentStock < dailyConsumption * 2) {
        const restock = Number((dailyConsumption * 7).toFixed(2)); // 1 week supply
        currentStock += restock;
        await inventoryMovementRepository.save({
          userProductId,
          movementType: MovementType.IN,
          quantity: restock,
          stockAfter: Number(currentStock.toFixed(2)),
          createdAt: new Date(date), // Later time
        });
      }
    }
    return Number(currentStock.toFixed(2));
  }

  // User1 Products (Initial Setup)
  const user1ProductsData = [
    { name: 'Arroz', estimatedStock: 2.5, dailyConsumption: 0.15, criticalStock: 0.5 },
    { name: 'Fideos', estimatedStock: 5, dailyConsumption: 0.3, criticalStock: 2 },
    { name: 'Aceite', estimatedStock: 1.5, dailyConsumption: 0.05, criticalStock: 0.3 },
    { name: 'Leche', estimatedStock: 3, dailyConsumption: 0.8, criticalStock: 1 },
    { name: 'Azúcar', estimatedStock: 1, dailyConsumption: 0.1, criticalStock: 0.3 },
    { name: 'Sal', estimatedStock: 0.5, dailyConsumption: 0.02, criticalStock: 0.1 },
    { name: 'Harina', estimatedStock: 2, dailyConsumption: 0.2, criticalStock: 0.5 },
    { name: 'Atún', estimatedStock: 8, dailyConsumption: 0.5, criticalStock: 3 },
  ];

  const user1ProductMap = new Map<string, UserProduct>();
  for (const item of user1ProductsData) {
    // Create UserProduct first
    const up = userProductRepository.create({
      userId: user1.id,
      productId: productMap.get(item.name)?.id,
      estimatedStock: item.estimatedStock,
      dailyConsumption: item.dailyConsumption,
      criticalStock: item.criticalStock,
    });
    await userProductRepository.save(up);

    // Generate History (30 days)
    const finalStock = await generateHistory(up.id, item.estimatedStock, item.dailyConsumption, 30);

    // Update UserProduct with final simulated stock
    up.estimatedStock = finalStock; // Update estimated too to match reality
    await userProductRepository.save(up);

    user1ProductMap.set(item.name, up);
  }

  // USER 2: Carlos
  const user2 = userRepository.create({
    phoneNumber: '+56987654321',
    name: 'Carlos Pérez',
    otpCode: '0000',
    otpExpiresAt: nextYear,
  });
  await userRepository.save(user2);

  // ADMIN USER
  const adminUser = userRepository.create({
    phoneNumber: '+56900000001',
    name: 'Admin Platanus',
    otpCode: '9999',
    otpExpiresAt: nextYear,
  });
  await userRepository.save(adminUser);

  // User 2 Products
  const user2ProductsData = [
    { name: 'Avena', estimatedStock: 1.5, dailyConsumption: 0.2, criticalStock: 0.4 },
    { name: 'Huevos', estimatedStock: 12, dailyConsumption: 2, criticalStock: 6 },
  ];

  for (const item of user2ProductsData) {
    const up = userProductRepository.create({
      userId: user2.id,
      productId: productMap.get(item.name)?.id,
      estimatedStock: item.estimatedStock,
      dailyConsumption: item.dailyConsumption,
      criticalStock: item.criticalStock,
    });
    await userProductRepository.save(up);

    const finalStock = await generateHistory(up.id, item.estimatedStock, item.dailyConsumption, 30);
    up.estimatedStock = finalStock;
    await userProductRepository.save(up);
  }

  // USER 3: Raimundo Mena
  const user3 = userRepository.create({
    phoneNumber: '+56988316760',
    name: 'Raimundo Mena',
    otpCode: '1234',
    otpExpiresAt: nextYear,
  });
  await userRepository.save(user3);

  // Raimundo Products (30+ varied items)
  const user3ProductsData = [
    { name: 'Arroz', estimatedStock: 5, dailyConsumption: 0.2, criticalStock: 1 },
    { name: 'Fideos', estimatedStock: 4, dailyConsumption: 0.15, criticalStock: 1 },
    { name: 'Aceite', estimatedStock: 2, dailyConsumption: 0.05, criticalStock: 0.5 },
    { name: 'Leche', estimatedStock: 6, dailyConsumption: 0.5, criticalStock: 2 },
    { name: 'Azúcar', estimatedStock: 1, dailyConsumption: 0.05, criticalStock: 0.2 },
    { name: 'Sal', estimatedStock: 1, dailyConsumption: 0.01, criticalStock: 0.1 },
    { name: 'Harina', estimatedStock: 2, dailyConsumption: 0.1, criticalStock: 0.5 },
    { name: 'Atún', estimatedStock: 10, dailyConsumption: 0.3, criticalStock: 3 },
    { name: 'Avena', estimatedStock: 1, dailyConsumption: 0.1, criticalStock: 0.2 },
    { name: 'Huevos', estimatedStock: 20, dailyConsumption: 2, criticalStock: 6 },
    { name: 'Pollo', estimatedStock: 3, dailyConsumption: 0.3, criticalStock: 1 },
    { name: 'Lentejas', estimatedStock: 2, dailyConsumption: 0.1, criticalStock: 0.5 },
    { name: 'Yogurt Griego', estimatedStock: 12, dailyConsumption: 1, criticalStock: 4 },
    { name: 'Aceite de Oliva', estimatedStock: 1, dailyConsumption: 0.03, criticalStock: 0.2 },
    { name: 'Detergente Ropa', estimatedStock: 3, dailyConsumption: 0.1, criticalStock: 1 },
    { name: 'Lavaloza', estimatedStock: 1, dailyConsumption: 0.05, criticalStock: 0.2 },
    { name: 'Papel Higiénico', estimatedStock: 20, dailyConsumption: 0.5, criticalStock: 6 },
    { name: 'Shampoo', estimatedStock: 1, dailyConsumption: 0.03, criticalStock: 0.2 },
    { name: 'Pasta de Dientes', estimatedStock: 2, dailyConsumption: 0.05, criticalStock: 1 },
    { name: 'Café', estimatedStock: 1, dailyConsumption: 0.04, criticalStock: 0.2 },
    { name: 'Agua Mineral', estimatedStock: 12, dailyConsumption: 1, criticalStock: 4 },
    { name: 'Galletas', estimatedStock: 5, dailyConsumption: 0.3, criticalStock: 2 },
    { name: 'Pan Molde', estimatedStock: 2, dailyConsumption: 0.3, criticalStock: 1 },
    { name: 'Marraqueta', estimatedStock: 3, dailyConsumption: 0.5, criticalStock: 1 },
    { name: 'Hamburguesas', estimatedStock: 8, dailyConsumption: 0.4, criticalStock: 2 },
    { name: 'Manzanas', estimatedStock: 6, dailyConsumption: 0.5, criticalStock: 2 },
    { name: 'Tomates', estimatedStock: 4, dailyConsumption: 0.3, criticalStock: 1 },
    { name: 'Mantequilla', estimatedStock: 2, dailyConsumption: 0.05, criticalStock: 0.5 },
    { name: 'Queso', estimatedStock: 1, dailyConsumption: 0.1, criticalStock: 0.3 },
    { name: 'Jamón', estimatedStock: 1, dailyConsumption: 0.1, criticalStock: 0.3 },
    { name: 'Cerveza', estimatedStock: 12, dailyConsumption: 0.5, criticalStock: 6 },
    { name: 'Bolsas de Basura', estimatedStock: 20, dailyConsumption: 0.2, criticalStock: 5 },
    { name: 'Quinoa', estimatedStock: 1, dailyConsumption: 0.05, criticalStock: 0.2 },
    { name: 'Garbanzos', estimatedStock: 1.5, dailyConsumption: 0.08, criticalStock: 0.4 },
    { name: 'Tofu', estimatedStock: 4, dailyConsumption: 0.2, criticalStock: 1 },
    { name: 'Leche de Almendras', estimatedStock: 3, dailyConsumption: 0.3, criticalStock: 1 },
    { name: 'Jabón', estimatedStock: 3, dailyConsumption: 0.05, criticalStock: 1 },
    { name: 'Té', estimatedStock: 5, dailyConsumption: 0.1, criticalStock: 2 },
    { name: 'Papas Fritas', estimatedStock: 4, dailyConsumption: 0.2, criticalStock: 1 },
    { name: 'Plátanos', estimatedStock: 3, dailyConsumption: 0.4, criticalStock: 1 },
    { name: 'Lechuga', estimatedStock: 4, dailyConsumption: 0.3, criticalStock: 1 },
    { name: 'Salsa de Tomate', estimatedStock: 3, dailyConsumption: 0.1, criticalStock: 1 },
  ];

  for (const item of user3ProductsData) {
    const up = userProductRepository.create({
      userId: user3.id,
      productId: productMap.get(item.name)?.id,
      estimatedStock: item.estimatedStock,
      dailyConsumption: item.dailyConsumption,
      criticalStock: item.criticalStock,
    });
    await userProductRepository.save(up);

    const finalStock = await generateHistory(up.id, item.estimatedStock, item.dailyConsumption, 60); // 60 days history
    up.estimatedStock = finalStock;
    await userProductRepository.save(up);
  }

  console.log('Seeding completed.');
  await AppDataSource.destroy();
}

seed().catch((error) => {
  console.error('Error during seeding:', error);
  process.exit(1);
});
