import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { SECTION_KINDS } from '../../domain/seat-map';
import type { SectionKind } from '../../domain/seat-map';
import { SeatMapEntity } from './seat-map.entity';
import { SeatRowEntity } from './seat-row.entity';

const sqlList = (values: readonly string[]): string =>
  values.map((value) => `'${value}'`).join(', ');

/**
 * A block of the layout that sells one way: addressable seats, or a counter.
 *
 * `capacity` is populated for general admission and NULL for seated, and the
 * CHECK enforces it. A seated section's capacity is the number of rows in
 * `seats`; storing that as a column too would create two answers to one
 * question, and the wrong one would be the fast one to read.
 */
@Entity({ name: 'sections' })
@Index('idx_sections_seat_map_id', ['seatMapId'])
@Unique('sections_name_unique_per_seat_map', ['seatMapId', 'name'])
@Check('sections_kind_check', `"kind" IN (${sqlList(SECTION_KINDS)})`)
@Check(
  'sections_capacity_matches_kind_check',
  `("kind" = 'general_admission' AND "capacity" IS NOT NULL AND "capacity" > 0)
   OR ("kind" = 'seated' AND "capacity" IS NULL)`,
)
export class SectionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'seat_map_id' })
  seatMapId: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 24 })
  kind: SectionKind;

  /** General admission only. NULL for seated sections, by constraint. */
  @Column({ type: 'int', nullable: true })
  capacity: number | null;

  /** Front to back. The order a seat map is drawn and listed in. */
  @Column({ type: 'int', name: 'display_order' })
  displayOrder: number;

  @ManyToOne(() => SeatMapEntity, (seatMap) => seatMap.sections, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'seat_map_id',
    foreignKeyConstraintName: 'sections_seat_map_id_fkey',
  })
  seatMap: SeatMapEntity;

  @OneToMany(() => SeatRowEntity, (row) => row.section)
  rows: SeatRowEntity[];
}
