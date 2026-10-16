import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './api/auth.controller';
import { SessionGuard } from './api/session.guard';
import { IdentityService } from './application/identity.service';
import { AccountsRepository } from './infrastructure/accounts.repository';
import { AccountEntity } from './infrastructure/entities/account.entity';
import { SessionEntity } from './infrastructure/entities/session.entity';
import { PasswordHasher } from './infrastructure/password-hasher';
import { SessionsRepository } from './infrastructure/sessions.repository';

/**
 * The Identity bounded context — who is acting.
 *
 * Exports the service and the guard. The guard has to be resolvable from any
 * module that puts `@UseGuards(SessionGuard)` on a controller, and it injects
 * IdentityService, so a context that guards its routes imports this module.
 */
@Module({
  imports: [TypeOrmModule.forFeature([AccountEntity, SessionEntity])],
  controllers: [AuthController],
  providers: [
    IdentityService,
    AccountsRepository,
    SessionsRepository,
    PasswordHasher,
    SessionGuard,
  ],
  exports: [IdentityService, SessionGuard],
})
export class IdentityModule {}
