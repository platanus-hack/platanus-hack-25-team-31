import { AppDataSource } from './data-source';
import { User } from './modules/users/entities/user.entity';
import { Home, FoodType } from './modules/homes/entities/home.entity';
import { Person, EatingRate, SportRate, Gender } from './modules/people/entities/person.entity';
import { Product, MeasurementUnit } from './modules/products/entities/product.entity';
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
  const dataLoadRepository = AppDataSource.getRepository(DataLoad);
  const dataLoadItemsRepository = AppDataSource.getRepository(DataLoadItems);
  const inventoryMovementRepository = AppDataSource.getRepository(InventoryMovement);

  // Clear existing data using TRUNCATE CASCADE to handle foreign keys
  console.log('Clearing existing data...');
  await AppDataSource.query(`
    TRUNCATE TABLE 
      inventory_movements,
      data_load_items,
      data_loads,
      products,
      people,
      homes,
      users
    CASCADE;
  `);

  // ========== USER 1: María González (Family Controller) ==========
  const user1 = userRepository.create({
    phoneNumber: '+56912345678',
    name: 'María González',
  });
  await userRepository.save(user1);
  console.log('Created user: María González');

  const home1 = homeRepository.create({
    userId: user1.id,
    income: 1500000,
    foodType: FoodType.BALANCED,
  });
  await homeRepository.save(home1);
  console.log('Created home for María González');

  // Family members in home1
  const person1_maria = personRepository.create({
    homeId: home1.id,
    age: 35,
    gender: Gender.FEMALE,
    eatingRate: EatingRate.NORMAL,
    sportRate: SportRate.NORMAL,
  });
  await personRepository.save(person1_maria);

  const person1_carlos = personRepository.create({
    homeId: home1.id,
    age: 38,
    gender: Gender.MALE,
    eatingRate: EatingRate.NORMAL,
    sportRate: SportRate.HIGH,
  });
  await personRepository.save(person1_carlos);

  const person1_sofia = personRepository.create({
    homeId: home1.id,
    age: 8,
    gender: Gender.FEMALE,
    eatingRate: EatingRate.NORMAL,
    sportRate: SportRate.NORMAL,
  });
  await personRepository.save(person1_sofia);
  console.log('Created 3 family members for María González');

  // Products for user1
  const products1 = [
    {
      name: 'Arroz',
      measurementUnit: MeasurementUnit.KILOGRAM,
      estimatedStock: 2.5,
      dailyConsumption: 0.15,
      criticalStock: 0.5,
      category: 'Granos',
    },
    {
      name: 'Fideos',
      measurementUnit: MeasurementUnit.PACK,
      estimatedStock: 5,
      dailyConsumption: 0.3,
      criticalStock: 2,
      category: 'Pasta',
    },
    {
      name: 'Aceite',
      measurementUnit: MeasurementUnit.LITER,
      estimatedStock: 1.5,
      dailyConsumption: 0.05,
      criticalStock: 0.3,
      category: 'Aceites',
    },
    {
      name: 'Leche',
      measurementUnit: MeasurementUnit.LITER,
      estimatedStock: 3,
      dailyConsumption: 0.8,
      criticalStock: 1,
      category: 'Lácteos',
    },
    {
      name: 'Azúcar',
      measurementUnit: MeasurementUnit.KILOGRAM,
      estimatedStock: 1,
      dailyConsumption: 0.1,
      criticalStock: 0.3,
      category: 'Endulzantes',
    },
    {
      name: 'Sal',
      measurementUnit: MeasurementUnit.KILOGRAM,
      estimatedStock: 0.5,
      dailyConsumption: 0.02,
      criticalStock: 0.1,
      category: 'Condimentos',
    },
    {
      name: 'Harina',
      measurementUnit: MeasurementUnit.KILOGRAM,
      estimatedStock: 2,
      dailyConsumption: 0.2,
      criticalStock: 0.5,
      category: 'Harinas',
    },
    {
      name: 'Atún',
      measurementUnit: MeasurementUnit.UNIT,
      estimatedStock: 8,
      dailyConsumption: 0.5,
      criticalStock: 3,
      category: 'Conservas',
    },
  ];

  const savedProducts1 = [];
  for (const productData of products1) {
    const product = productRepository.create({
      ...productData,
      userId: user1.id,
    });
    const saved = await productRepository.save(product);
    savedProducts1.push(saved);
  }
  console.log(`Created ${savedProducts1.length} products for María González`);

  // Data loads for user1 (receipts and manual entries)
  const dataLoad1_receipt = dataLoadRepository.create({
    userId: user1.id,
    sourceType: SourceType.RECEIPT,
    loadDate: new Date('2024-11-15'),
  });
  await dataLoadRepository.save(dataLoad1_receipt);

  const dataLoad1_manual = dataLoadRepository.create({
    userId: user1.id,
    sourceType: SourceType.MANUAL,
    loadDate: new Date('2024-11-10'),
  });
  await dataLoadRepository.save(dataLoad1_manual);
  console.log('Created data loads for María González');

  // Data load items
  const dataLoadItems1 = [
    {
      dataLoadId: dataLoad1_receipt.id,
      productId: savedProducts1[0].id, // Arroz
      quantity: 2,
    },
    {
      dataLoadId: dataLoad1_receipt.id,
      productId: savedProducts1[1].id, // Fideos
      quantity: 4,
    },
    {
      dataLoadId: dataLoad1_receipt.id,
      productId: savedProducts1[2].id, // Aceite
      quantity: 1,
    },
    {
      dataLoadId: dataLoad1_receipt.id,
      productId: savedProducts1[3].id, // Leche
      quantity: 2,
    },
    {
      dataLoadId: dataLoad1_manual.id,
      productId: savedProducts1[4].id, // Azúcar
      quantity: 1,
    },
    {
      dataLoadId: dataLoad1_manual.id,
      productId: savedProducts1[5].id, // Sal
      quantity: 0.5,
    },
  ];

  for (const itemData of dataLoadItems1) {
    const item = dataLoadItemsRepository.create(itemData);
    await dataLoadItemsRepository.save(item);
  }
  console.log('Created data load items for María González');

  // Inventory movements for user1
  const movements1 = [
    {
      userId: user1.id,
      productId: savedProducts1[0].id, // Arroz
      movementType: MovementType.IN,
      quantity: 2,
      sourceLoadId: dataLoad1_receipt.id,
    },
    {
      userId: user1.id,
      productId: savedProducts1[1].id, // Fideos
      movementType: MovementType.IN,
      quantity: 4,
      sourceLoadId: dataLoad1_receipt.id,
    },
    {
      userId: user1.id,
      productId: savedProducts1[0].id, // Arroz
      movementType: MovementType.OUT,
      quantity: 0.5,
      sourceLoadId: null,
    },
    {
      userId: user1.id,
      productId: savedProducts1[3].id, // Leche
      movementType: MovementType.OUT,
      quantity: 0.5,
      sourceLoadId: null,
    },
  ];

  for (const movementData of movements1) {
    const movement = inventoryMovementRepository.create(movementData);
    await inventoryMovementRepository.save(movement);
  }
  console.log('Created inventory movements for María González');

  // ========== USER 2: Carlos Pérez (Family Controller) ==========
  const user2 = userRepository.create({
    phoneNumber: '+56987654321',
    name: 'Carlos Pérez',
  });
  await userRepository.save(user2);
  console.log('Created user: Carlos Pérez');

  const home2 = homeRepository.create({
    userId: user2.id,
    income: 2000000,
    foodType: FoodType.HEALTHY,
  });
  await homeRepository.save(home2);
  console.log('Created home for Carlos Pérez');

  // Family members in home2
  const person2_carlos = personRepository.create({
    homeId: home2.id,
    age: 42,
    gender: Gender.MALE,
    eatingRate: EatingRate.NORMAL,
    sportRate: SportRate.HIGH,
  });
  await personRepository.save(person2_carlos);

  const person2_ana = personRepository.create({
    homeId: home2.id,
    age: 40,
    gender: Gender.FEMALE,
    eatingRate: EatingRate.LOW,
    sportRate: SportRate.HIGH,
  });
  await personRepository.save(person2_ana);

  const person2_lucas = personRepository.create({
    homeId: home2.id,
    age: 12,
    gender: Gender.MALE,
    eatingRate: EatingRate.HIGH,
    sportRate: SportRate.HIGH,
  });
  await personRepository.save(person2_lucas);
  console.log('Created 3 family members for Carlos Pérez');

  // Products for user2
  const products2 = [
    {
      name: 'Avena',
      measurementUnit: MeasurementUnit.KILOGRAM,
      estimatedStock: 1.5,
      dailyConsumption: 0.2,
      criticalStock: 0.4,
      category: 'Cereales',
    },
    {
      name: 'Quinoa',
      measurementUnit: MeasurementUnit.KILOGRAM,
      estimatedStock: 0.8,
      dailyConsumption: 0.15,
      criticalStock: 0.3,
      category: 'Granos',
    },
    {
      name: 'Aceite de Oliva',
      measurementUnit: MeasurementUnit.LITER,
      estimatedStock: 0.8,
      dailyConsumption: 0.03,
      criticalStock: 0.2,
      category: 'Aceites',
    },
    {
      name: 'Yogurt Griego',
      measurementUnit: MeasurementUnit.UNIT,
      estimatedStock: 6,
      dailyConsumption: 1,
      criticalStock: 2,
      category: 'Lácteos',
    },
    {
      name: 'Huevos',
      measurementUnit: MeasurementUnit.UNIT,
      estimatedStock: 12,
      dailyConsumption: 2,
      criticalStock: 6,
      category: 'Proteínas',
    },
    {
      name: 'Pollo',
      measurementUnit: MeasurementUnit.KILOGRAM,
      estimatedStock: 1.5,
      dailyConsumption: 0.3,
      criticalStock: 0.5,
      category: 'Carnes',
    },
  ];

  const savedProducts2 = [];
  for (const productData of products2) {
    const product = productRepository.create({
      ...productData,
      userId: user2.id,
    });
    const saved = await productRepository.save(product);
    savedProducts2.push(saved);
  }
  console.log(`Created ${savedProducts2.length} products for Carlos Pérez`);

  // Data loads for user2
  const dataLoad2_receipt = dataLoadRepository.create({
    userId: user2.id,
    sourceType: SourceType.RECEIPT,
    loadDate: new Date('2024-11-18'),
  });
  await dataLoadRepository.save(dataLoad2_receipt);

  // Data load items for user2
  const dataLoadItems2 = [
    {
      dataLoadId: dataLoad2_receipt.id,
      productId: savedProducts2[0].id, // Avena
      quantity: 1.5,
    },
    {
      dataLoadId: dataLoad2_receipt.id,
      productId: savedProducts2[3].id, // Yogurt
      quantity: 6,
    },
    {
      dataLoadId: dataLoad2_receipt.id,
      productId: savedProducts2[4].id, // Huevos
      quantity: 12,
    },
  ];

  for (const itemData of dataLoadItems2) {
    const item = dataLoadItemsRepository.create(itemData);
    await dataLoadItemsRepository.save(item);
  }
  console.log('Created data load items for Carlos Pérez');

  // Inventory movements for user2
  const movements2 = [
    {
      userId: user2.id,
      productId: savedProducts2[0].id, // Avena
      movementType: MovementType.IN,
      quantity: 1.5,
      sourceLoadId: dataLoad2_receipt.id,
    },
    {
      userId: user2.id,
      productId: savedProducts2[3].id, // Yogurt
      movementType: MovementType.IN,
      quantity: 6,
      sourceLoadId: dataLoad2_receipt.id,
    },
    {
      userId: user2.id,
      productId: savedProducts2[3].id, // Yogurt
      movementType: MovementType.OUT,
      quantity: 2,
      sourceLoadId: null,
    },
  ];

  for (const movementData of movements2) {
    const movement = inventoryMovementRepository.create(movementData);
    await inventoryMovementRepository.save(movement);
  }
  console.log('Created inventory movements for Carlos Pérez');

  // ========== USER 3: Ana Martínez (Single Person) ==========
  const user3 = userRepository.create({
    phoneNumber: '+56911223344',
    name: 'Ana Martínez',
  });
  await userRepository.save(user3);
  console.log('Created user: Ana Martínez');

  const home3 = homeRepository.create({
    userId: user3.id,
    income: 800000,
    foodType: FoodType.VEGETARIAN,
  });
  await homeRepository.save(home3);
  console.log('Created home for Ana Martínez');

  // Single person in home3
  const person3_ana = personRepository.create({
    homeId: home3.id,
    age: 28,
    gender: Gender.FEMALE,
    eatingRate: EatingRate.LOW,
    sportRate: SportRate.NORMAL,
  });
  await personRepository.save(person3_ana);
  console.log('Created 1 family member for Ana Martínez');

  // Products for user3
  const products3 = [
    {
      name: 'Lentejas',
      measurementUnit: MeasurementUnit.KILOGRAM,
      estimatedStock: 0.5,
      dailyConsumption: 0.1,
      criticalStock: 0.2,
      category: 'Legumbres',
    },
    {
      name: 'Garbanzos',
      measurementUnit: MeasurementUnit.KILOGRAM,
      estimatedStock: 0.5,
      dailyConsumption: 0.08,
      criticalStock: 0.2,
      category: 'Legumbres',
    },
    {
      name: 'Tofu',
      measurementUnit: MeasurementUnit.UNIT,
      estimatedStock: 3,
      dailyConsumption: 0.3,
      criticalStock: 1,
      category: 'Proteínas Vegetales',
    },
    {
      name: 'Leche de Almendras',
      measurementUnit: MeasurementUnit.LITER,
      estimatedStock: 2,
      dailyConsumption: 0.3,
      criticalStock: 0.5,
      category: 'Bebidas Vegetales',
    },
    {
      name: 'Avena',
      measurementUnit: MeasurementUnit.KILOGRAM,
      estimatedStock: 1,
      dailyConsumption: 0.15,
      criticalStock: 0.3,
      category: 'Cereales',
    },
  ];

  const savedProducts3 = [];
  for (const productData of products3) {
    const product = productRepository.create({
      ...productData,
      userId: user3.id,
    });
    const saved = await productRepository.save(product);
    savedProducts3.push(saved);
  }
  console.log(`Created ${savedProducts3.length} products for Ana Martínez`);

  // Data loads for user3
  const dataLoad3_manual = dataLoadRepository.create({
    userId: user3.id,
    sourceType: SourceType.MANUAL,
    loadDate: new Date('2024-11-12'),
  });
  await dataLoadRepository.save(dataLoad3_manual);

  // Data load items for user3
  const dataLoadItems3 = [
    {
      dataLoadId: dataLoad3_manual.id,
      productId: savedProducts3[0].id, // Lentejas
      quantity: 0.5,
    },
    {
      dataLoadId: dataLoad3_manual.id,
      productId: savedProducts3[2].id, // Tofu
      quantity: 3,
    },
    {
      dataLoadId: dataLoad3_manual.id,
      productId: savedProducts3[3].id, // Leche de Almendras
      quantity: 2,
    },
  ];

  for (const itemData of dataLoadItems3) {
    const item = dataLoadItemsRepository.create(itemData);
    await dataLoadItemsRepository.save(item);
  }
  console.log('Created data load items for Ana Martínez');

  // Inventory movements for user3
  const movements3 = [
    {
      userId: user3.id,
      productId: savedProducts3[0].id, // Lentejas
      movementType: MovementType.IN,
      quantity: 0.5,
      sourceLoadId: dataLoad3_manual.id,
    },
    {
      userId: user3.id,
      productId: savedProducts3[2].id, // Tofu
      movementType: MovementType.IN,
      quantity: 3,
      sourceLoadId: dataLoad3_manual.id,
    },
    {
      userId: user3.id,
      productId: savedProducts3[2].id, // Tofu
      movementType: MovementType.OUT,
      quantity: 1,
      sourceLoadId: null,
    },
  ];

  for (const movementData of movements3) {
    const movement = inventoryMovementRepository.create(movementData);
    await inventoryMovementRepository.save(movement);
  }
  console.log('Created inventory movements for Ana Martínez');

  console.log('\n✅ Database seeded successfully!');
  console.log('\nSummary:');
  console.log(`- Users: 3`);
  console.log(`- Homes: 3`);
  console.log(`- People: 7`);
  console.log(`- Products: ${savedProducts1.length + savedProducts2.length + savedProducts3.length}`);
  console.log(`- Data Loads: 4`);
  console.log(`- Inventory Movements: ${movements1.length + movements2.length + movements3.length}`);

  await AppDataSource.destroy();
}

seed().catch((error) => {
  console.error('Error during seeding:', error);
  process.exit(1);
});
