import { Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { PriceTierEntity } from './price-tier.entity';
import { SectionEntity } from './section.entity';

/**
 * Which sections a Price Tier covers — the mapping the glossary calls for
 * ("a named price band for an Event, mapped onto sections of the Seat Map").
 *
 * Written as an entity rather than a `@ManyToMany` join table so the primary
 * key, both foreign keys and the index are named here and match the migration
 * exactly. A generated join table names things its own way, and then every
 * schema diff argues about it.
 *
 * The rule the database cannot state: a section must be covered by *at most
 * one* tier of any given event. Tiers belong to an event and sections belong to
 * a venue's layout, so no single constraint spans the pair — Catalog enforces
 * it when a tier is saved, and the publish rule re-checks it before Inventory
 * snapshots anything priced.
 */
@Entity({ name: 'price_tier_sections' })
@Index('idx_price_tier_sections_section_id', ['sectionId'])
export class PriceTierSectionEntity {
  @PrimaryColumn({ type: 'uuid', name: 'price_tier_id' })
  priceTierId: string;

  @PrimaryColumn({ type: 'uuid', name: 'section_id' })
  sectionId: string;

  @ManyToOne(() => PriceTierEntity, (tier) => tier.sections, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'price_tier_id',
    foreignKeyConstraintName: 'price_tier_sections_price_tier_id_fkey',
  })
  priceTier: PriceTierEntity;

  @ManyToOne(() => SectionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'section_id',
    foreignKeyConstraintName: 'price_tier_sections_section_id_fkey',
  })
  section: SectionEntity;
}
