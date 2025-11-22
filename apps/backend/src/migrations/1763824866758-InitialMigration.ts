import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialMigration1763824866758 implements MigrationInterface {
    name = 'InitialMigration1763824866758'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create ENUM types only if they don't exist (idempotent)
        // Note: CREATE TYPE in PostgreSQL is not transactional - it commits immediately
        // So we must check existence first to make migrations idempotent
        await queryRunner.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'people_eating_rate_enum') THEN CREATE TYPE "public"."people_eating_rate_enum" AS ENUM('low', 'normal', 'high'); END IF; END $$;`);
        await queryRunner.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'people_gender_enum') THEN CREATE TYPE "public"."people_gender_enum" AS ENUM('male', 'female', 'other'); END IF; END $$;`);
        await queryRunner.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'people_sport_rate_enum') THEN CREATE TYPE "public"."people_sport_rate_enum" AS ENUM('low', 'normal', 'high'); END IF; END $$;`);
        await queryRunner.query(`CREATE TABLE "people" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "modified_at" TIMESTAMP NOT NULL DEFAULT now(), "removed_at" TIMESTAMP, "age" integer NOT NULL, "eating_rate" "public"."people_eating_rate_enum" NOT NULL, "gender" "public"."people_gender_enum" NOT NULL, "sport_rate" "public"."people_sport_rate_enum" NOT NULL, "home_id" uuid NOT NULL, CONSTRAINT "PK_aa866e71353ee94c6cc51059c5b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'homes_food_type_enum') THEN CREATE TYPE "public"."homes_food_type_enum" AS ENUM('process_food', 'vegetarian', 'healthy', 'balanced', 'other'); END IF; END $$;`);
        await queryRunner.query(`CREATE TABLE "homes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "modified_at" TIMESTAMP NOT NULL DEFAULT now(), "removed_at" TIMESTAMP, "income" numeric(10,2) NOT NULL, "food_type" "public"."homes_food_type_enum" NOT NULL, "user_id" uuid NOT NULL, CONSTRAINT "REL_4911430f572de50494de5ba7ca" UNIQUE ("user_id"), CONSTRAINT "PK_a85aa6f2e56424fc745effdd5f2" PRIMARY KEY ("id"))`);
        await queryRunner.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inventory_movements_movement_type_enum') THEN CREATE TYPE "public"."inventory_movements_movement_type_enum" AS ENUM('in', 'out', 'adjustment'); END IF; END $$;`);
        await queryRunner.query(`CREATE TABLE "inventory_movements" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "modified_at" TIMESTAMP NOT NULL DEFAULT now(), "removed_at" TIMESTAMP, "user_id" uuid NOT NULL, "product_id" uuid NOT NULL, "movement_type" "public"."inventory_movements_movement_type_enum" NOT NULL, "quantity" numeric(10,2) NOT NULL, "source_load_id" uuid, CONSTRAINT "PK_d7597827c1dcffae889db3ab873" PRIMARY KEY ("id"))`);
        await queryRunner.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'data_loads_source_type_enum') THEN CREATE TYPE "public"."data_loads_source_type_enum" AS ENUM('receipt', 'manual'); END IF; END $$;`);
        await queryRunner.query(`CREATE TABLE "data_loads" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "modified_at" TIMESTAMP NOT NULL DEFAULT now(), "removed_at" TIMESTAMP, "user_id" uuid NOT NULL, "source_type" "public"."data_loads_source_type_enum" NOT NULL, "load_date" date NOT NULL, CONSTRAINT "PK_1982acbd7fdd40753f46a4f625b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "data_load_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "modified_at" TIMESTAMP NOT NULL DEFAULT now(), "removed_at" TIMESTAMP, "data_load_id" uuid NOT NULL, "product_id" uuid NOT NULL, "quantity" numeric(10,2) NOT NULL, CONSTRAINT "PK_a1e6d14ac81c4cb33ad29b2e079" PRIMARY KEY ("id"))`);
        await queryRunner.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'products_measurement_unit_enum') THEN CREATE TYPE "public"."products_measurement_unit_enum" AS ENUM('gram', 'kilogram', 'liter', 'milliliter', 'unit', 'pack', 'other'); END IF; END $$;`);
        await queryRunner.query(`CREATE TABLE "products" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "modified_at" TIMESTAMP NOT NULL DEFAULT now(), "removed_at" TIMESTAMP, "name" character varying NOT NULL, "user_id" uuid NOT NULL, "measurement_unit" "public"."products_measurement_unit_enum" NOT NULL, "estimated_stock" numeric(10,2) NOT NULL, "daily_consumption" numeric(10,2) NOT NULL, "critical_stock" numeric(10,2) NOT NULL, "category" character varying NOT NULL, CONSTRAINT "PK_0806c755e0aca124e67c0cf6d7d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "modified_at" TIMESTAMP NOT NULL DEFAULT now(), "removed_at" TIMESTAMP, "phone_number" character varying NOT NULL, "name" character varying NOT NULL, CONSTRAINT "UQ_17d1817f241f10a3dbafb169fd2" UNIQUE ("phone_number"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "people" ADD CONSTRAINT "FK_3e3dbf063ffb2e1a47ee869edde" FOREIGN KEY ("home_id") REFERENCES "homes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "homes" ADD CONSTRAINT "FK_4911430f572de50494de5ba7ca1" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "inventory_movements" ADD CONSTRAINT "FK_63cca4adcd28b6fe19bc4ceb22f" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "inventory_movements" ADD CONSTRAINT "FK_5c3bec1682252c36fa161587738" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "inventory_movements" ADD CONSTRAINT "FK_3ef7b423dbc8990c7f3e142ffe7" FOREIGN KEY ("source_load_id") REFERENCES "data_loads"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "data_loads" ADD CONSTRAINT "FK_9e39a3d55104e6412c8701fb407" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "data_load_items" ADD CONSTRAINT "FK_081b66f18429325038d56aa9dbc" FOREIGN KEY ("data_load_id") REFERENCES "data_loads"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "data_load_items" ADD CONSTRAINT "FK_a84da26b1276822cd47b19513d2" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "products" ADD CONSTRAINT "FK_176b502c5ebd6e72cafbd9d6f70" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "products" DROP CONSTRAINT "FK_176b502c5ebd6e72cafbd9d6f70"`);
        await queryRunner.query(`ALTER TABLE "data_load_items" DROP CONSTRAINT "FK_a84da26b1276822cd47b19513d2"`);
        await queryRunner.query(`ALTER TABLE "data_load_items" DROP CONSTRAINT "FK_081b66f18429325038d56aa9dbc"`);
        await queryRunner.query(`ALTER TABLE "data_loads" DROP CONSTRAINT "FK_9e39a3d55104e6412c8701fb407"`);
        await queryRunner.query(`ALTER TABLE "inventory_movements" DROP CONSTRAINT "FK_3ef7b423dbc8990c7f3e142ffe7"`);
        await queryRunner.query(`ALTER TABLE "inventory_movements" DROP CONSTRAINT "FK_5c3bec1682252c36fa161587738"`);
        await queryRunner.query(`ALTER TABLE "inventory_movements" DROP CONSTRAINT "FK_63cca4adcd28b6fe19bc4ceb22f"`);
        await queryRunner.query(`ALTER TABLE "homes" DROP CONSTRAINT "FK_4911430f572de50494de5ba7ca1"`);
        await queryRunner.query(`ALTER TABLE "people" DROP CONSTRAINT "FK_3e3dbf063ffb2e1a47ee869edde"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TABLE "products"`);
        await queryRunner.query(`DROP TYPE "public"."products_measurement_unit_enum"`);
        await queryRunner.query(`DROP TABLE "data_load_items"`);
        await queryRunner.query(`DROP TABLE "data_loads"`);
        await queryRunner.query(`DROP TYPE "public"."data_loads_source_type_enum"`);
        await queryRunner.query(`DROP TABLE "inventory_movements"`);
        await queryRunner.query(`DROP TYPE "public"."inventory_movements_movement_type_enum"`);
        await queryRunner.query(`DROP TABLE "homes"`);
        await queryRunner.query(`DROP TYPE "public"."homes_food_type_enum"`);
        await queryRunner.query(`DROP TABLE "people"`);
        await queryRunner.query(`DROP TYPE "public"."people_sport_rate_enum"`);
        await queryRunner.query(`DROP TYPE "public"."people_gender_enum"`);
        await queryRunner.query(`DROP TYPE "public"."people_eating_rate_enum"`);
    }

}
