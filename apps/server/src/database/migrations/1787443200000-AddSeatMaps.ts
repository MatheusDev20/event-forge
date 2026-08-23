import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Seat maps: the layout of a venue, reused across the events held there.
 *
 * Four tables rather than one denormalised "seats" table, because the levels
 * are addressed independently — a price tier covers a section, a ticket names a
 * row and a seat, and a general-admission section has neither. The join table
 * at the end is the tier → section mapping the glossary calls for.
 *
 * Nothing here records availability. That is Inventory's, against its own
 * snapshot of these rows — see docs/adr/0006-seat-map-snapshot.md.
 */
export class AddSeatMaps1787443200000 implements MigrationInterface {
  name = 'AddSeatMaps1787443200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "seat_maps" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "venue_id" uuid NOT NULL,
        "name" varchar(120) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "seat_maps_venue_id_fkey" FOREIGN KEY ("venue_id")
          REFERENCES "venues"("id") ON DELETE CASCADE,
        CONSTRAINT "seat_maps_name_unique_per_venue" UNIQUE ("venue_id", "name"),
        -- Redundant as a uniqueness claim, load-bearing as a reference target:
        -- events points a composite foreign key at exactly this pair.
        CONSTRAINT "seat_maps_id_venue_id_unique" UNIQUE ("id", "venue_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "sections" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "seat_map_id" uuid NOT NULL,
        "name" varchar(120) NOT NULL,
        "kind" varchar(24) NOT NULL,
        "capacity" integer,
        "display_order" integer NOT NULL,
        CONSTRAINT "sections_seat_map_id_fkey" FOREIGN KEY ("seat_map_id")
          REFERENCES "seat_maps"("id") ON DELETE CASCADE,
        CONSTRAINT "sections_name_unique_per_seat_map" UNIQUE ("seat_map_id", "name"),
        CONSTRAINT "sections_kind_check" CHECK (
          "kind" IN ('seated', 'general_admission')
        ),
        -- A seated section's capacity is its seat count; a second copy of that
        -- number is a second answer waiting to be wrong.
        CONSTRAINT "sections_capacity_matches_kind_check" CHECK (
          ("kind" = 'general_admission' AND "capacity" IS NOT NULL AND "capacity" > 0)
          OR ("kind" = 'seated' AND "capacity" IS NULL)
        )
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "seat_rows" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "section_id" uuid NOT NULL,
        "label" varchar(16) NOT NULL,
        "display_order" integer NOT NULL,
        CONSTRAINT "seat_rows_section_id_fkey" FOREIGN KEY ("section_id")
          REFERENCES "sections"("id") ON DELETE CASCADE,
        CONSTRAINT "seat_rows_label_unique_per_section" UNIQUE ("section_id", "label")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "seats" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "row_id" uuid NOT NULL,
        "label" varchar(16) NOT NULL,
        "display_order" integer NOT NULL,
        CONSTRAINT "seats_row_id_fkey" FOREIGN KEY ("row_id")
          REFERENCES "seat_rows"("id") ON DELETE CASCADE,
        CONSTRAINT "seats_label_unique_per_row" UNIQUE ("row_id", "label")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "events" ADD COLUMN "seat_map_id" uuid
    `);

    /**
     * The composite is the point. A plain reference to seat_maps(id) would let
     * an event at the Theatro Municipal sell the Mineirão's layout; referencing
     * the (id, venue_id) pair makes that unrepresentable. MATCH SIMPLE — the
     * default — skips the check entirely while seat_map_id is NULL, which is
     * what lets the column arrive nullable and tighten later.
     */
    await queryRunner.query(`
      ALTER TABLE "events"
        ADD CONSTRAINT "events_seat_map_id_venue_id_fkey"
        FOREIGN KEY ("seat_map_id", "venue_id")
        REFERENCES "seat_maps"("id", "venue_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "price_tier_sections" (
        "price_tier_id" uuid NOT NULL,
        "section_id" uuid NOT NULL,
        CONSTRAINT "PK_price_tier_sections" PRIMARY KEY ("price_tier_id", "section_id"),
        CONSTRAINT "price_tier_sections_price_tier_id_fkey" FOREIGN KEY ("price_tier_id")
          REFERENCES "price_tiers"("id") ON DELETE CASCADE,
        CONSTRAINT "price_tier_sections_section_id_fkey" FOREIGN KEY ("section_id")
          REFERENCES "sections"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "idx_seat_maps_venue_id" ON "seat_maps" ("venue_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_sections_seat_map_id" ON "sections" ("seat_map_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_seat_rows_section_id" ON "seat_rows" ("section_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_seats_row_id" ON "seats" ("row_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_events_seat_map_id" ON "events" ("seat_map_id")`,
    );
    // The tier side is covered by the primary key's leading column; the section
    // side is the one that needs its own index ("which tier prices this seat?").
    await queryRunner.query(
      `CREATE INDEX "idx_price_tier_sections_section_id" ON "price_tier_sections" ("section_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "price_tier_sections"`);
    await queryRunner.query(
      `ALTER TABLE "events" DROP CONSTRAINT "events_seat_map_id_venue_id_fkey"`,
    );
    await queryRunner.query(`DROP INDEX "idx_events_seat_map_id"`);
    await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "seat_map_id"`);
    await queryRunner.query(`DROP TABLE "seats"`);
    await queryRunner.query(`DROP TABLE "seat_rows"`);
    await queryRunner.query(`DROP TABLE "sections"`);
    await queryRunner.query(`DROP TABLE "seat_maps"`);
  }
}
