import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { EventEntity } from './event.entity';

@Entity({ name: 'organizers' })
export class OrganizerEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 160 })
  name: string;

  @Column({ type: 'timestamptz', name: 'created_at', default: () => 'now()' })
  createdAt: Date;

  @OneToMany(() => EventEntity, (event) => event.organizer)
  events: EventEntity[];
}
