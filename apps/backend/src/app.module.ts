import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { UsersModule } from './modules/users/users.module';
import { HomesModule } from './modules/homes/homes.module';
import { PeopleModule } from './modules/people/people.module';
import { ProductsModule } from './modules/products/products.module';
import { DataLoadsModule } from './modules/data-loads/data-loads.module';
import { DataLoadItemsModule } from './modules/data-load-items/data-load-items.module';
import { InventoryMovementsModule } from './modules/inventory-movements/inventory-movements.module';
import { AuthModule } from './modules/auth/auth.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { AdminModule } from './modules/admin/admin.module';
@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'despens',
      autoLoadEntities: true,
      synchronize: true,
    }),
    UsersModule,
    HomesModule,
    PeopleModule,
    ProductsModule,
    CategoriesModule,
    DataLoadsModule,
    DataLoadItemsModule,
    InventoryMovementsModule,
    AuthModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
