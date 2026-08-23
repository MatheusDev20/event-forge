import {
  Column,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { EventEntity } from './event.entity';

@Entity({ name: 'venues' })
@Index('idx_venues_city', ['city'])
export class VenueEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 160 })
  name: string;

  @Column({ type: 'varchar', length: 120 })
  city: string;

  /** ISO 3166-1 alpha-2, uppercase. */
  @Column({ type: 'char', length: 2 })
  country: string;

  @Column({ type: 'timestamptz', name: 'created_at', default: () => 'now()' })
  createdAt: Date;

  @OneToMany(() => EventEntity, (event) => event.venue)
  events: EventEntity[];
}
