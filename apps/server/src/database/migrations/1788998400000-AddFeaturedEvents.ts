import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `events.featured` — the storefront's editorial highlight.
 *
 * One boolean rather than a sixth status, and rather than a separate
 * `featured_events` table. A status would make "featured" a state an event has
 * to leave to go on sale, which is not how anyone uses a front page; a join
 * table would buy ordering and scheduling that nothing asks for yet, at the
 * cost of a join on the busiest read in the catalog.
 *
 * NOT NULL DEFAULT false is what makes this a safe add: every existing row
 * gets an answer, and so does every insert written before this column existed
 * — the seed included, which highlights nothing on purpose and leaves the
 * choosing to whoever runs it.
 *
 * Postgres 11+ fills a non-volatile default from the catalog rather than
 * rewriting the table, so this is a metadata-only change however many events
 * are already stored.
 */
export class AddFeaturedEvents1788998400000 implements MigrationInterface {
  name = 'AddFeaturedEvents1788998400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "events"
        ADD COLUMN "featured" boolean NOT NULL DEFAULT false
    `);

    /*
     * `(featured, starts_at)` in that order: every read of this column is an
     * equality on `featured` followed by a date ordering — the home page asks
     * for the highlighted events, soonest first — and a composite in that
     * order serves the sort from the index rather than sorting afterwards.
     *
     * Not a partial index (`WHERE featured`), which would be smaller and just
     * as fast for the true case. The declaration has to match the entity's
     * `@Index` exactly or `migration:generate` reads it as drift and helpfully
     * drops it, and a plain composite is the shape both sides express the same
     * way. Nothing here is large enough for the difference to be measurable.
     */
    await queryRunner.query(`
      CREATE INDEX "idx_events_featured_starts_at"
        ON "events" ("featured", "starts_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_events_featured_starts_at"`);
    await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "featured"`);
  }
}
