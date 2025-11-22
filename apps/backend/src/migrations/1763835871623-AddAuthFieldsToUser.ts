import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuthFieldsToUser1763835871623 implements MigrationInterface {
  name = 'AddAuthFieldsToUser1763835871623';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "otp_code" character varying`);
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "otp_expires_at" TIMESTAMP`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "otp_expires_at"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "otp_code"`);
  }
}
