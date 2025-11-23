import { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveQuantity1763875812638 implements MigrationInterface {
    name = 'RemoveQuantity1763875812638'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_products" DROP COLUMN "quantity"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_products" ADD "quantity" numeric(10,2) NOT NULL`);
    }

}
