import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Identity, and the link from it to Catalog's organizers.
 *
 * Three tables, two contexts:
 *
 * - `accounts` and `sessions` are Identity's. `sessions.account_id` carries a
 *   foreign key because both ends are inside one boundary.
 * - `organizer_members` is Catalog's. Its `organizer_id` has a foreign key;
 *   its `account_id` does not, because it points across into Identity and
 *   ADR-0001 keeps foreign keys from crossing a context boundary — the same
 *   rule `holds.event_id` follows.
 *
 * Existing organizers (the seed's) get no members. They stay valid and simply
 * unreachable from the console until someone is added to them, which is the
 * honest state for rows no account ever created.
 *
 * See docs/adr/0008-identity-sessions-and-memberships.md.
 */
export class AddIdentity1789516800000 implements MigrationInterface {
  name = 'AddIdentity1789516800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "accounts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "email" varchar(254) NOT NULL,
        "name" varchar(120) NOT NULL,
        "password_hash" varchar(255) NOT NULL,
        "role" varchar(16) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "accounts_role_check" CHECK (
          "role" IN ('attendee', 'organizer', 'admin')
        )
      )
    `);

    // Emails are lower-cased by the contract before they reach this table, so
    // a plain unique index agrees with users about what "the same" means.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_accounts_email" ON "accounts" ("email")
    `);

    await queryRunner.query(`
      CREATE TABLE "sessions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "token_hash" char(64) NOT NULL,
        "account_id" uuid NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_sessions_account_id" FOREIGN KEY ("account_id")
          REFERENCES "accounts"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_sessions_token_hash" ON "sessions" ("token_hash")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_sessions_account_id" ON "sessions" ("account_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "organizer_members" (
        "organizer_id" uuid NOT NULL,
        "account_id" uuid NOT NULL,
        "role" varchar(16) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_organizer_members" PRIMARY KEY ("organizer_id", "account_id"),
        CONSTRAINT "fk_organizer_members_organizer_id" FOREIGN KEY ("organizer_id")
          REFERENCES "organizers"("id") ON DELETE CASCADE,
        CONSTRAINT "organizer_members_role_check" CHECK (
          "role" IN ('admin', 'member')
        )
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_organizer_members_account_id"
        ON "organizer_members" ("account_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "organizer_members"`);
    await queryRunner.query(`DROP TABLE "sessions"`);
    await queryRunner.query(`DROP TABLE "accounts"`);
  }
}
