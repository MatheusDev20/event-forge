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
import { SectionEntity } from './section.entity';
import { VenueEntity } from './venue.entity';

/**
 * A named layout of a Venue — "Concert mode", "Football mode". A venue can hold
 * more than one, and an Event picks the one it is using.
 *
 * Cascading from the venue is safe *here* and only here: once Inventory has
 * snapshotted a layout it no longer references these rows at all, so deleting a
 * venue cannot orphan an allocation. See docs/adr/0006-seat-map-snapshot.md.
 */
@Entity({ name: 'seat_maps' })
@Index('idx_seat_maps_venue_id', ['venueId'])
@Unique('seat_maps_name_unique_per_venue', ['venueId', 'name'])
/**
 * Redundant on its own — `id` is already unique — but it is the target of the
 * composite foreign key on `events`, which is what stops an event pointing at
 * another venue's layout. Postgres requires a unique constraint on exactly the
 * referenced pair.
 */
@Unique('seat_maps_id_venue_id_unique', ['id', 'venueId'])
export class SeatMapEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'venue_id' })
  venueId: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'timestamptz', name: 'created_at', default: () => 'now()' })
  createdAt: Date;

  @ManyToOne(() => VenueEntity, (venue) => venue.seatMaps, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'venue_id',
    foreignKeyConstraintName: 'seat_maps_venue_id_fkey',
  })
  venue: VenueEntity;

  @OneToMany(() => SectionEntity, (section) => section.seatMap)
  sections: SectionEntity[];
}
