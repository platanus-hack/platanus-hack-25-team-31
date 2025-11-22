import { MigrationInterface, QueryRunner } from "typeorm";

export class PowerUpInventoryMovement1763838600338 implements MigrationInterface {
    name = 'PowerUpInventoryMovement1763838600338'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('TRUNCATE TABLE inventory_movements CASCADE');
        await queryRunner.query(`DROP TABLE IF EXISTS "user_product_history"`);
        await queryRunner.query(`ALTER TABLE "inventory_movements" ADD "stock_after" numeric(10,2) NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "inventory_movements" DROP COLUMN "stock_after"`);
        await queryRunner.query(`CREATE TABLE "user_product_history" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "modified_at" TIMESTAMP NOT NULL DEFAULT now(), "removed_at" TIMESTAMP, "user_product_id" uuid NOT NULL, "timestamp" TIMESTAMP NOT NULL, "quantity" numeric(10,2) NOT NULL, CONSTRAINT "PK_6689d37abac8d0ab88b0fcf70f1" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "user_product_history" ADD CONSTRAINT "FK_2876a2b62f00a6ff836861d359d" FOREIGN KEY ("user_product_id") REFERENCES "user_products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
