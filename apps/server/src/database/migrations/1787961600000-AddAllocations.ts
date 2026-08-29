import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Allocations: the units of capacity one Event puts on sale, and the first
 * table in this system that two requests can fight over.
 *
 * This is Inventory's snapshot of a Catalog seat map, taken when an Event is
 * published — see docs/adr/0006-seat-map-snapshot.md. Two consequences show up
 * directly in the DDL below:
 *
 * - **No foreign key to `events`, `sections` or `seats`.** Cross-context
 *   references are plain ids (ADR-0001), and more importantly this table must
 *   keep describing what was *sold* after Catalog re-letters the venue. The
 *   denormalised `section_name` / `row_label` / `seat_label` are that record;
 *   the `catalog_*_id` columns are for tracing, not for joining.
 * - **Two shapes in one table.** A seated section becomes one row per seat; a
 *   general-admission section becomes a single counter row. The roadmap wants
 *   those two contention profiles compared — thousands of warm rows against
 *   one hot one — so they are distinct from the first migration rather than
 *   separated later.
 *
 * `allocations_no_oversell_check` is the point of the whole table. The domain
 * model states `held + reserved <= capacity` as an invariant that holds "under
 * any interleaving", and application-level locking cannot promise that on its
 * own because the promise must survive code that is wrong. As a CHECK,
 * Postgres refuses the write. When the race test fires N requests at one seat,
 * a broken strategy cannot oversell — it can only fail loudly.
 */
export class AddAllocations1787961600000 implements MigrationInterface {
  name = 'AddAllocations1787961600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "allocations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "event_id" uuid NOT NULL,
        "kind" varchar(24) NOT NULL,
        "catalog_section_id" uuid NOT NULL,
        "catalog_seat_id" uuid,
        "section_name" varchar(120) NOT NULL,
        "row_label" varchar(16),
        "seat_label" varchar(16),
        "capacity" integer NOT NULL,
        "held" integer NOT NULL DEFAULT 0,
        "reserved" integer NOT NULL DEFAULT 0,
        -- For the optimistic strategy the roadmap compares against pessimistic
        -- locking. Here from the start so switching strategies is a change of
        -- query rather than a migration between benchmark runs.
        --
        -- No DEFAULT: it is TypeORM @VersionColumn, which sets 1 on insert
        -- and increments on save. A database default drifts against the
        -- entity, and the schema-drift check says so.
        "version" integer NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "allocations_kind_check" CHECK (
          "kind" IN ('seated', 'general_admission')
        ),
        CONSTRAINT "allocations_capacity_positive_check" CHECK ("capacity" > 0),
        CONSTRAINT "allocations_non_negative_check" CHECK (
          "held" >= 0 AND "reserved" >= 0
        ),
        -- The invariant this context exists to keep.
        CONSTRAINT "allocations_no_oversell_check" CHECK (
          "held" + "reserved" <= "capacity"
        ),
        -- A seat carries its identity and sells exactly one unit; a counter
        -- carries none and sells many. Nothing in between is a valid row.
        CONSTRAINT "allocations_seat_identity_matches_kind_check" CHECK (
          ("kind" = 'seated'
            AND "catalog_seat_id" IS NOT NULL
            AND "row_label" IS NOT NULL
            AND "seat_label" IS NOT NULL
            AND "capacity" = 1)
          OR ("kind" = 'general_admission'
            AND "catalog_seat_id" IS NULL
            AND "row_label" IS NULL
            AND "seat_label" IS NULL)
        )
      )
    `);

    // Availability is always asked per event, and per section within it.
    await queryRunner.query(`
      CREATE INDEX "idx_allocations_event_id" ON "allocations" ("event_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_allocations_event_id_section"
        ON "allocations" ("event_id", "catalog_section_id")
    `);

    /*
     * Snapshotting an event twice would double its capacity, so both halves of
     * "once per unit, per event" are constraints rather than intentions.
     *
     * Seated rows are covered by the seat id; NULLs do not collide in a
     * Postgres unique index, so general-admission rows fall outside this one
     * for free. They get the partial index below, which has to be partial
     * because a seated section legitimately has thousands of rows sharing its
     * section id.
     */
    await queryRunner.query(`
      CREATE UNIQUE INDEX "allocations_seat_unique_per_event"
        ON "allocations" ("event_id", "catalog_seat_id")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "allocations_ga_unique_per_event"
        ON "allocations" ("event_id", "catalog_section_id")
        WHERE "kind" = 'general_admission'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Indexes go with the table; dropping it is enough.
    await queryRunner.query(`DROP TABLE "allocations"`);
  }
}
