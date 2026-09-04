import { Module, type OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogModule } from '../catalog';
import { DomainEventBus } from '../../shared/events';
import { HoldsController } from './api/holds.controller';
import { InventoryService } from './application/inventory.service';
import { SnapshotOnPublish } from './application/snapshot-on-publish.handler';
import { AllocationsRepository } from './infrastructure/allocations.repository';
import { AllocationEntity } from './infrastructure/entities/allocation.entity';
import { HoldEntity } from './infrastructure/entities/hold.entity';
import { HoldLineEntity } from './infrastructure/entities/hold-line.entity';
import { HoldsRepository } from './infrastructure/holds.repository';

/**
 * The Inventory bounded context — what is free.
 *
 * It subscribes to `EventPublished` in `onModuleInit` rather than being wired
 * up by the composition root. A context owning its own subscriptions is what
 * lets Catalog publish the fact without importing anything from here, and it
 * means adding a second listener later touches one file instead of two.
 *
 * `imports: [CatalogModule]` is the sanctioned direction: Inventory reads
 * Catalog's public surface, Catalog never reads Inventory's. Reversing it
 * would invert the context map — see docs/adr/0006-seat-map-snapshot.md.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([AllocationEntity, HoldEntity, HoldLineEntity]),
    CatalogModule,
  ],
  controllers: [HoldsController],
  providers: [
    InventoryService,
    AllocationsRepository,
    HoldsRepository,
    SnapshotOnPublish,
  ],
  exports: [InventoryService],
})
export class InventoryModule implements OnModuleInit {
  constructor(
    private readonly bus: DomainEventBus,
    private readonly snapshotOnPublish: SnapshotOnPublish,
  ) {}

  onModuleInit(): void {
    this.bus.subscribe(this.snapshotOnPublish);
  }
}
