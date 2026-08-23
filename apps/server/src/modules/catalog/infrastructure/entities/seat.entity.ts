import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { SeatRowEntity } from './seat-row.entity';

/**
 * One addressable place in the room.
 *
 * Note what is not here: no status, no "taken" flag, no event id. A seat is a
 * property of the building, and whether it is free is a question about one
 * Event — which is Inventory's to answer, against its own snapshot of this row.
 * Putting availability here is the single change that would collapse the two
 * contexts into one, so it is the one thing this table must never grow.
 *
 * No coordinates either, deliberately: the web app draws sections and rows in
 * `display_order`, which is enough for a grid. Real geometry (an arena's curved
 * stands) is a rendering concern that can arrive as its own column later
 * without touching anything that depends on seat identity.
 */
@Entity({ name: 'seats' })
@Index('idx_seats_row_id', ['rowId'])
@Unique('seats_label_unique_per_row', ['rowId', 'label'])
export class SeatEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'row_id' })
  rowId: string;

  /** As printed on the ticket: "1", "14", "3A". */
  @Column({ type: 'varchar', length: 16 })
  label: string;

  @Column({ type: 'int', name: 'display_order' })
  displayOrder: number;

  @ManyToOne(() => SeatRowEntity, (row) => row.seats, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'row_id',
    foreignKeyConstraintName: 'seats_row_id_fkey',
  })
  row: SeatRowEntity;
}
