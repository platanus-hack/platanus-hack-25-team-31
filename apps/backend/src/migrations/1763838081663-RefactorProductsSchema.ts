import { MigrationInterface, QueryRunner } from "typeorm";

export class RefactorProductsSchema1763838081663 implements MigrationInterface {
    name = 'RefactorProductsSchema1763838081663'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('TRUNCATE TABLE inventory_movements, data_load_items, data_loads, products CASCADE');
        
        await queryRunner.query(`ALTER TABLE "products" DROP CONSTRAINT "FK_176b502c5ebd6e72cafbd9d6f70"`);
        await queryRunner.query(`ALTER TABLE "inventory_movements" DROP CONSTRAINT "FK_63cca4adcd28b6fe19bc4ceb22f"`);
        await queryRunner.query(`ALTER TABLE "inventory_movements" DROP CONSTRAINT "FK_5c3bec1682252c36fa161587738"`);
        await queryRunner.query(`ALTER TABLE "data_load_items" DROP CONSTRAINT "FK_a84da26b1276822cd47b19513d2"`);
        await queryRunner.query(`ALTER TABLE "data_load_items" RENAME COLUMN "product_id" TO "user_product_id"`);
        await queryRunner.query(`CREATE TABLE "categories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "modified_at" TIMESTAMP NOT NULL DEFAULT now(), "removed_at" TIMESTAMP, "name" character varying NOT NULL, "emoji" character varying NOT NULL, CONSTRAINT "PK_24dbc6126a28ff948da33e97d3b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "user_product_history" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "modified_at" TIMESTAMP NOT NULL DEFAULT now(), "removed_at" TIMESTAMP, "user_product_id" uuid NOT NULL, "timestamp" TIMESTAMP NOT NULL, "quantity" numeric(10,2) NOT NULL, CONSTRAINT "PK_6689d37abac8d0ab88b0fcf70f1" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "user_products" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "modified_at" TIMESTAMP NOT NULL DEFAULT now(), "removed_at" TIMESTAMP, "user_id" uuid NOT NULL, "product_id" uuid NOT NULL, "estimated_stock" numeric(10,2) NOT NULL, "daily_consumption" numeric(10,2) NOT NULL, "critical_stock" numeric(10,2) NOT NULL, "quantity" numeric(10,2) NOT NULL, CONSTRAINT "PK_347cc741febfe07d6d46d048fb4" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "user_id"`);
        await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "measurement_unit"`);
        await queryRunner.query(`DROP TYPE "public"."products_measurement_unit_enum"`);
        await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "estimated_stock"`);
        await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "daily_consumption"`);
        await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "critical_stock"`);
        await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "category"`);
        await queryRunner.query(`ALTER TABLE "inventory_movements" DROP COLUMN "user_id"`);
        await queryRunner.query(`ALTER TABLE "inventory_movements" DROP COLUMN "product_id"`);
        await queryRunner.query(`CREATE TYPE "public"."products_unit_enum" AS ENUM('gram', 'kilogram', 'liter', 'milliliter', 'unit', 'pack', 'other')`);
        await queryRunner.query(`ALTER TABLE "products" ADD "unit" "public"."products_unit_enum" NOT NULL`);
        await queryRunner.query(`ALTER TABLE "products" ADD "category_id" uuid NOT NULL`);
        await queryRunner.query(`ALTER TABLE "inventory_movements" ADD "user_product_id" uuid NOT NULL`);
        await queryRunner.query(`ALTER TABLE "products" ADD CONSTRAINT "FK_9a5f6868c96e0069e699f33e124" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_product_history" ADD CONSTRAINT "FK_2876a2b62f00a6ff836861d359d" FOREIGN KEY ("user_product_id") REFERENCES "user_products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "inventory_movements" ADD CONSTRAINT "FK_6f78d7b161dec1d57dc0a171ad5" FOREIGN KEY ("user_product_id") REFERENCES "user_products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "data_load_items" ADD CONSTRAINT "FK_be97ce7616a5ec1f3ee5e8846e1" FOREIGN KEY ("user_product_id") REFERENCES "user_products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_products" ADD CONSTRAINT "FK_494f0246efbe65076d1051c6539" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_products" ADD CONSTRAINT "FK_1c5a5dc69b4ac2b5ee475684779" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_products" DROP CONSTRAINT "FK_1c5a5dc69b4ac2b5ee475684779"`);
        await queryRunner.query(`ALTER TABLE "user_products" DROP CONSTRAINT "FK_494f0246efbe65076d1051c6539"`);
        await queryRunner.query(`ALTER TABLE "data_load_items" DROP CONSTRAINT "FK_be97ce7616a5ec1f3ee5e8846e1"`);
        await queryRunner.query(`ALTER TABLE "inventory_movements" DROP CONSTRAINT "FK_6f78d7b161dec1d57dc0a171ad5"`);
        await queryRunner.query(`ALTER TABLE "user_product_history" DROP CONSTRAINT "FK_2876a2b62f00a6ff836861d359d"`);
        await queryRunner.query(`ALTER TABLE "products" DROP CONSTRAINT "FK_9a5f6868c96e0069e699f33e124"`);
        await queryRunner.query(`ALTER TABLE "inventory_movements" DROP COLUMN "user_product_id"`);
        await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "category_id"`);
        await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "unit"`);
        await queryRunner.query(`DROP TYPE "public"."products_unit_enum"`);
        await queryRunner.query(`ALTER TABLE "inventory_movements" ADD "product_id" uuid NOT NULL`);
        await queryRunner.query(`ALTER TABLE "inventory_movements" ADD "user_id" uuid NOT NULL`);
        await queryRunner.query(`ALTER TABLE "products" ADD "category" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "products" ADD "critical_stock" numeric(10,2) NOT NULL`);
        await queryRunner.query(`ALTER TABLE "products" ADD "daily_consumption" numeric(10,2) NOT NULL`);
        await queryRunner.query(`ALTER TABLE "products" ADD "estimated_stock" numeric(10,2) NOT NULL`);
        await queryRunner.query(`CREATE TYPE "public"."products_measurement_unit_enum" AS ENUM('gram', 'kilogram', 'liter', 'milliliter', 'unit', 'pack', 'other')`);
        await queryRunner.query(`ALTER TABLE "products" ADD "measurement_unit" "public"."products_measurement_unit_enum" NOT NULL`);
        await queryRunner.query(`ALTER TABLE "products" ADD "user_id" uuid NOT NULL`);
        await queryRunner.query(`DROP TABLE "user_products"`);
        await queryRunner.query(`DROP TABLE "user_product_history"`);
        await queryRunner.query(`DROP TABLE "categories"`);
        await queryRunner.query(`ALTER TABLE "data_load_items" RENAME COLUMN "user_product_id" TO "product_id"`);
        await queryRunner.query(`ALTER TABLE "data_load_items" ADD CONSTRAINT "FK_a84da26b1276822cd47b19513d2" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "inventory_movements" ADD CONSTRAINT "FK_5c3bec1682252c36fa161587738" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "inventory_movements" ADD CONSTRAINT "FK_63cca4adcd28b6fe19bc4ceb22f" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "products" ADD CONSTRAINT "FK_176b502c5ebd6e72cafbd9d6f70" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
