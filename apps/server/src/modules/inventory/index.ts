/**
 * Inventory's public surface.
 *
 * As narrow as Catalog's, and for the same reason: Ordering will ask this
 * context to turn a hold into a reservation, and it must not be able to reach
 * an allocation row to do it.
 */
export { InventoryModule } from './inventory.module';
export { InventoryService } from './application/inventory.service';
export {
  ALLOCATION_KINDS,
  allocatableUnits,
  snapshotCapacity,
  type AllocationKind,
} from './domain/allocation';
