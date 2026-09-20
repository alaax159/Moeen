import { Global, Module } from '@nestjs/common';

import { UserRepository } from '../database/repository/user.repository';
import { FirebaseAdminService } from './firebase-admin.service';
import { FirebaseAuthGuard } from './firebase-auth.guard';


@Global()
@Module({
  controllers: [],
  providers: [
    FirebaseAdminService,
    FirebaseAuthGuard,
    UserRepository,
  ],
  exports: [FirebaseAdminService, FirebaseAuthGuard],
})
export class AuthModule {}
