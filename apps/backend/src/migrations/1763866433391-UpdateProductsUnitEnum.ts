import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migrations1763866433391 implements MigrationInterface {
  name = 'Migrations1763866433391';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Rename old enum type
    await queryRunner.query(`ALTER TYPE "public"."products_unit_enum" RENAME TO "products_unit_enum_old"`);

    // Create new enum type with updated values
    await queryRunner.query(
      `CREATE TYPE "public"."products_unit_enum" AS ENUM('gr', 'kg', 'L', 'ml', 'unit', 'pack', 'other')`,
    );

    // Map old values to new values using CASE statement
    await queryRunner.query(`
            ALTER TABLE "products" 
            ALTER COLUMN "unit" TYPE "public"."products_unit_enum" 
            USING CASE 
                WHEN "unit"::text = 'gram' THEN 'gr'::"public"."products_unit_enum"
                WHEN "unit"::text = 'kilogram' THEN 'kg'::"public"."products_unit_enum"
                WHEN "unit"::text = 'liter' THEN 'L'::"public"."products_unit_enum"
                WHEN "unit"::text = 'milliliter' THEN 'ml'::"public"."products_unit_enum"
                WHEN "unit"::text = 'unit' THEN 'unit'::"public"."products_unit_enum"
                WHEN "unit"::text = 'pack' THEN 'pack'::"public"."products_unit_enum"
                WHEN "unit"::text = 'other' THEN 'other'::"public"."products_unit_enum"
                ELSE 'other'::"public"."products_unit_enum"
            END
        `);

    // Drop old enum type
    await queryRunner.query(`DROP TYPE "public"."products_unit_enum_old"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Create old enum type
    await queryRunner.query(
      `CREATE TYPE "public"."products_unit_enum_old" AS ENUM('gram', 'kilogram', 'liter', 'milliliter', 'unit', 'pack', 'other')`,
    );

    // Map new values back to old values using CASE statement
    await queryRunner.query(`
            ALTER TABLE "products" 
            ALTER COLUMN "unit" TYPE "public"."products_unit_enum_old" 
            USING CASE 
                WHEN "unit"::text = 'gr' THEN 'gram'::"public"."products_unit_enum_old"
                WHEN "unit"::text = 'kg' THEN 'kilogram'::"public"."products_unit_enum_old"
                WHEN "unit"::text = 'L' THEN 'liter'::"public"."products_unit_enum_old"
                WHEN "unit"::text = 'ml' THEN 'milliliter'::"public"."products_unit_enum_old"
                WHEN "unit"::text = 'unit' THEN 'unit'::"public"."products_unit_enum_old"
                WHEN "unit"::text = 'pack' THEN 'pack'::"public"."products_unit_enum_old"
                WHEN "unit"::text = 'other' THEN 'other'::"public"."products_unit_enum_old"
                ELSE 'other'::"public"."products_unit_enum_old"
            END
        `);

    // Drop new enum type
    await queryRunner.query(`DROP TYPE "public"."products_unit_enum"`);

    // Rename old enum type back
    await queryRunner.query(`ALTER TYPE "public"."products_unit_enum_old" RENAME TO "products_unit_enum"`);
  }
}
