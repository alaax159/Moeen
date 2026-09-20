import { Global, Module } from '@nestjs/common';

import { UserSyncService } from './user-sync.service';
import { UserSyncGuard } from './user-sync.guard';
import { UsersController } from './users.controller';

@Global()
@Module({
  controllers: [
    UsersController,
  ],

  providers: [
    UserSyncService,
    UserSyncGuard,
  ],

  exports: [
    UserSyncService,
    UserSyncGuard,
  ],
})
export class UsersModule {}