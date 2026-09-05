/**
 * How many seats a section actually contains, counted through its rows, as a
 * correlated subquery.
 *
 * Zero for general admission, which has no rows by design — `sectionCapacity`
 * reads the counter column for those instead.
 *
 * Shared rather than written twice because two repositories ask the same
 * question — the publish rule needs it to know whether a section has anything
 * to sell, the venue listing needs it to report capacity — and two copies of a
 * correlated subquery are two things that have to keep agreeing about what a
 * seated section's capacity *is*.
 *
 * **The outer query must alias `sections` as `section`.** The correlation is
 * on `section.id`, and an outer query that names it anything else will fail at
 * the database rather than here.
 */
export const SECTION_SEAT_COUNT = `(
  SELECT COUNT(*)
  FROM seats seat
  JOIN seat_rows seat_row ON seat_row.id = seat.row_id
  WHERE seat_row.section_id = section.id
)`;
