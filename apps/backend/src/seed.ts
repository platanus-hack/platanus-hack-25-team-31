import { AppDataSource } from './data-source';
import { User } from './modules/users/entities/user.entity';
import { Home, FoodType } from './modules/homes/entities/home.entity';
import { Person, EatingRate, SportRate, Gender } from './modules/people/entities/person.entity';
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

  // USER 3: Agustín
  const user3 = userRepository.create({
    phoneNumber: '+56966463798',
    name: 'Agustín',
    otpCode: '0000',
    otpExpiresAt: nextYear,
  });
  await userRepository.save(user3);

  // Create Home for Agustín (he's the only one in his house)
  const agustinHome = homeRepository.create({
    userId: user3.id,
    foodType: FoodType.BALANCED, // Come balanceado
    income: 1500000, // Ingreso estimado
  });
  await homeRepository.save(agustinHome);

  // Create Person for Agustín
  const agustinPerson = personRepository.create({
    homeId: agustinHome.id,
    age: 24,
    gender: Gender.MALE, // Hombre
    eatingRate: EatingRate.LOW, // No considera que coma mucha comida
    sportRate: SportRate.HIGH, // Hace mucho deporte
  });
  await personRepository.save(agustinPerson);

  // User 3 Products (Agustín - productos saludables para deportista que come balanceado pero poco)
  const user3ProductsData = [
    { name: 'Pollo', estimatedStock: 1.5, dailyConsumption: 0.12, criticalStock: 0.4 }, // Proteína para deporte
    { name: 'Huevos', estimatedStock: 12, dailyConsumption: 1.5, criticalStock: 6 }, // Proteína
    { name: 'Quinoa', estimatedStock: 1, dailyConsumption: 0.08, criticalStock: 0.3 }, // Granos saludables
    { name: 'Yogurt Griego', estimatedStock: 6, dailyConsumption: 0.5, criticalStock: 2 }, // Proteína láctea
    { name: 'Avena', estimatedStock: 1, dailyConsumption: 0.1, criticalStock: 0.3 }, // Cereales para deportistas
    { name: 'Aceite de Oliva', estimatedStock: 0.5, dailyConsumption: 0.03, criticalStock: 0.15 }, // Grasas saludables
    { name: 'Lentejas', estimatedStock: 0.8, dailyConsumption: 0.06, criticalStock: 0.25 }, // Legumbres proteicas
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

    const finalStock = await generateHistory(up.id, item.estimatedStock, item.dailyConsumption, 30);
    up.estimatedStock = finalStock;
    await userProductRepository.save(up);
  }

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

  console.log('Seeding completed.');
  await AppDataSource.destroy();
}

seed().catch((error) => {
  console.error('Error during seeding:', error);
  process.exit(1);
});
