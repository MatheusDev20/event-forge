import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Catalog's initial schema.
 *
 * Written by hand rather than generated: the generated version reflects what
 * the entities happen to say, while this states what the database must
 * guarantee — check constraints, index choices, and the cascade rule.
 */
export class InitCatalog1787011200000 implements MigrationInterface {
  name = 'InitCatalog1787011200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "organizers" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar(160) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "venues" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar(160) NOT NULL,
        "city" varchar(120) NOT NULL,
        "country" char(2) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "events" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "slug" varchar(180) NOT NULL,
        "title" varchar(200) NOT NULL,
        "description" text NOT NULL,
        "category" varchar(32) NOT NULL,
        "status" varchar(32) NOT NULL,
        "starts_at" timestamptz NOT NULL,
        "ends_at" timestamptz,
        "doors_open_at" timestamptz,
        "hero_image_url" text,
        "venue_id" uuid NOT NULL REFERENCES "venues"("id"),
        "organizer_id" uuid NOT NULL REFERENCES "organizers"("id"),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "events_status_check" CHECK (
          "status" IN ('draft', 'published', 'on_sale', 'closed', 'cancelled')
        ),
        CONSTRAINT "events_category_check" CHECK (
          "category" IN ('music', 'sports', 'theatre', 'conference', 'comedy', 'festival')
        ),
        CONSTRAINT "events_ends_after_starts_check" CHECK (
          "ends_at" IS NULL OR "ends_at" >= "starts_at"
        )
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "price_tiers" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "event_id" uuid NOT NULL REFERENCES "events"("id") ON DELETE CASCADE,
        "name" varchar(80) NOT NULL,
        "price_amount_minor" integer NOT NULL,
        "price_currency" char(3) NOT NULL,
        CONSTRAINT "price_tiers_amount_check" CHECK ("price_amount_minor" >= 0),
        CONSTRAINT "price_tiers_currency_check" CHECK (
          "price_currency" IN ('BRL', 'USD', 'EUR')
        ),
        CONSTRAINT "price_tiers_name_unique_per_event" UNIQUE ("event_id", "name")
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_events_slug" ON "events" ("slug")`,
    );

    // The public listing always filters on status and orders by starts_at, so
    // the two live in one index in that order.
    await queryRunner.query(
      `CREATE INDEX "idx_events_status_starts_at" ON "events" ("status", "starts_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_events_category" ON "events" ("category")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_events_venue_id" ON "events" ("venue_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_events_organizer_id" ON "events" ("organizer_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_price_tiers_event_id" ON "price_tiers" ("event_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_venues_city" ON "venues" ("city")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "price_tiers"`);
    await queryRunner.query(`DROP TABLE "events"`);
    await queryRunner.query(`DROP TABLE "venues"`);
    await queryRunner.query(`DROP TABLE "organizers"`);
  }
}
