import {
  Controller,
  Get,
  UseGuards,
} from '@nestjs/common';

import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';

import { CurrentUser } from './current-user.decorator';
import { UserSyncGuard } from './user-sync.guard';

@Controller('users')
@UseGuards(
  FirebaseAuthGuard,
  UserSyncGuard,
)
export class UsersController {
  @Get('me')
  getMe(
    @CurrentUser() user: any,
  ) {
    return {
      id: user.id,
      firebaseUid: user.firebaseUid,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}