import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { CURRENCIES } from '../../domain/event';
import type { Currency } from '../../domain/event';
import { EventEntity } from './event.entity';

@Entity({ name: 'price_tiers' })
@Index('idx_price_tiers_event_id', ['eventId'])
@Unique('price_tiers_name_unique_per_event', ['eventId', 'name'])
@Check('price_tiers_amount_check', `"price_amount_minor" >= 0`)
@Check(
  'price_tiers_currency_check',
  `"price_currency" IN (${CURRENCIES.map((currency) => `'${currency}'`).join(', ')})`,
)
export class PriceTierEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'event_id' })
  eventId: string;

  @Column({ type: 'varchar', length: 80 })
  name: string;

  /**
   * Integer minor units. `bigint` would come back as a string from pg and
   * `numeric` invites floats; an int caps a single tier at ~21M in cents,
   * which is well past any ticket price this system will see.
   */
  @Column({ type: 'int', name: 'price_amount_minor' })
  priceAmountMinor: number;

  @Column({ type: 'char', length: 3, name: 'price_currency' })
  priceCurrency: Currency;

  @ManyToOne(() => EventEntity, (event) => event.priceTiers, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'event_id',
    foreignKeyConstraintName: 'price_tiers_event_id_fkey',
  })
  event: EventEntity;
}
