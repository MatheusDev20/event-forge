import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Holds: the claim, and the first write in this system that two requests
 * genuinely fight over.
 *
 * `allocations` created something scarce; this creates the act of taking it.
 * The interesting part is not this DDL — it is the statement in
 * `holds.repository.ts` that locks allocation rows before touching them. What
 * these two tables contribute is the *record* of who won, which is what makes
 * the race test able to say "exactly one" rather than "no error occurred".
 *
 * Two notes on the foreign keys, because they cut both ways:
 *
 * - `hold_lines` references `holds` and `allocations` with real foreign keys.
 *   ADR-0001 forbids FKs *across* contexts; all three tables are Inventory's,
 *   so inside the boundary the database gets to enforce what it is good at.
 * - `holds.event_id` has no foreign key, for the same reason
 *   `allocations.event_id` does not: it points at Catalog.
 *
 * `expires_at` is written and not yet enforced. Nothing sweeps it and no read
 * discounts it — see docs/roadmap.md, where hold expiry is deliberately a
 * separate experiment needing an injectable clock. The column and its index
 * are here from the start so that experiment changes behaviour rather than
 * schema.
 */
export class AddHolds1788480000000 implements MigrationInterface {
  name = 'AddHolds1788480000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "holds" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        -- Catalog's event id. No foreign key, by ADR-0001.
        "event_id" uuid NOT NULL,
        -- Opaque until Identity exists (Slice 4). A uuid because it will
        -- become a user id, and widening a column later is worse than
        -- choosing the eventual shape now.
        "holder_id" uuid NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'active',
        "expires_at" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "holds_status_check" CHECK (
          "status" IN ('active', 'released', 'converted')
        ),
        -- A hold that expired before it existed is not a short hold; it is a
        -- clock bug, and it should fail at the write rather than confuse
        -- whatever eventually enforces expiry.
        CONSTRAINT "holds_expires_after_creation_check" CHECK (
          "expires_at" > "created_at"
        )
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_holds_event_id" ON "holds" ("event_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_holds_holder_id" ON "holds" ("holder_id")
    `);
    /*
     * Partial on `active`, which is the only status a sweeper or a read-time
     * expiry check would ever scan. Released and converted holds are history
     * and there will be far more of them than live ones.
     */
    await queryRunner.query(`
      CREATE INDEX "idx_holds_active_expires_at"
        ON "holds" ("expires_at")
        WHERE "status" = 'active'
    `);

    await queryRunner.query(`
      CREATE TABLE "hold_lines" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "hold_id" uuid NOT NULL,
        "allocation_id" uuid NOT NULL,
        -- 1 for a seat, N for a slice of a general-admission counter.
        "quantity" integer NOT NULL,
        CONSTRAINT "hold_lines_quantity_positive_check" CHECK ("quantity" > 0),
        CONSTRAINT "fk_hold_lines_hold" FOREIGN KEY ("hold_id")
          REFERENCES "holds" ("id") ON DELETE CASCADE,
        -- No cascade here: an allocation with live claims against it must not
        -- be deletable, and the error is the point.
        CONSTRAINT "fk_hold_lines_allocation" FOREIGN KEY ("allocation_id")
          REFERENCES "allocations" ("id")
      )
    `);

    /*
     * One line per allocation per hold. Two lines for the same seat inside one
     * claim would double the units taken from a counter while reading like a
     * single request — the domain rejects it, and this is what makes the
     * rejection true rather than intended.
     */
    await queryRunner.query(`
      CREATE UNIQUE INDEX "hold_lines_allocation_unique_per_hold"
        ON "hold_lines" ("hold_id", "allocation_id")
    `);
    // "who is holding this seat?", which is the question the race test asks.
    await queryRunner.query(`
      CREATE INDEX "idx_hold_lines_allocation_id"
        ON "hold_lines" ("allocation_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Lines first: they carry the foreign key into holds.
    await queryRunner.query(`DROP TABLE "hold_lines"`);
    await queryRunner.query(`DROP TABLE "holds"`);
  }
}
