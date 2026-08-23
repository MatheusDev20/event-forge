import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { SeatEntity } from './seat.entity';
import { SectionEntity } from './section.entity';

/**
 * `seat_rows`, not `rows`: the plain word is a keyword in enough SQL contexts
 * that every query touching it would need quoting to stay readable, and it
 * reads better next to `seats` anyway. Only seated sections have any.
 */
@Entity({ name: 'seat_rows' })
@Index('idx_seat_rows_section_id', ['sectionId'])
@Unique('seat_rows_label_unique_per_section', ['sectionId', 'label'])
export class SeatRowEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'section_id' })
  sectionId: string;

  /** As printed on the ticket: "A", "12", "AA". */
  @Column({ type: 'varchar', length: 16 })
  label: string;

  @Column({ type: 'int', name: 'display_order' })
  displayOrder: number;

  @ManyToOne(() => SectionEntity, (section) => section.rows, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'section_id',
    foreignKeyConstraintName: 'seat_rows_section_id_fkey',
  })
  section: SectionEntity;

  @OneToMany(() => SeatEntity, (seat) => seat.row)
  seats: SeatEntity[];
}
