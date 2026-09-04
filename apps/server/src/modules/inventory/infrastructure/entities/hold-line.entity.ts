import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AllocationEntity } from './allocation.entity';
import { HoldEntity } from './hold.entity';

/**
 * One line of a claim: which allocation, and how many units of it.
 *
 * The quantity is what keeps one endpoint honest about two contention shapes.
 * A seated line is always 1 — the allocation's capacity makes anything else
 * impossible — while a general-admission line takes N units out of a single
 * counter row. Slice 3 points the same request at the hot row without a second
 * table or a second endpoint.
 *
 * Both foreign keys are real. ADR-0001 forbids them *across* contexts; holds,
 * hold_lines and allocations are all Inventory's, and inside the boundary
 * referential integrity is the database's job, not a convention.
 */
@Entity({ name: 'hold_lines' })
/**
 * One line per allocation per hold. Without this, two lines naming the same
 * seat inside one request would take two units under one quantity — the domain
 * refuses it, and this is what makes the refusal true rather than intended.
 */
@Index('hold_lines_allocation_unique_per_hold', ['holdId', 'allocationId'], {
  unique: true,
})
/** "Who is holding this seat?" — the question the race test asks afterwards. */
@Index('idx_hold_lines_allocation_id', ['allocationId'])
@Check('hold_lines_quantity_positive_check', `"quantity" > 0`)
export class HoldLineEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'hold_id' })
  holdId: string;

  @Column({ type: 'uuid', name: 'allocation_id' })
  allocationId: string;

  /** 1 for a seat, N for a slice of a counter. */
  @Column({ type: 'int' })
  quantity: number;

  @ManyToOne(() => HoldEntity, (hold) => hold.lines, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'hold_id',
    foreignKeyConstraintName: 'fk_hold_lines_hold',
  })
  hold: HoldEntity;

  /**
   * No cascade: an allocation with live claims against it must not be
   * deletable, and the foreign key error is the intended outcome.
   */
  @ManyToOne(() => AllocationEntity)
  @JoinColumn({
    name: 'allocation_id',
    foreignKeyConstraintName: 'fk_hold_lines_allocation',
  })
  allocation: AllocationEntity;
}
