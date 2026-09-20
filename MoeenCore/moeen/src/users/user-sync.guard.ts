import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { Request } from 'express';

import { UserSyncService } from './user-sync.service';

type AuthenticatedRequest = Request & {
  firebaseUser?: {
    uid: string;
    email?: string;
  };

  user?: unknown;
};

@Injectable()
export class UserSyncGuard
  implements CanActivate
{
  constructor(
    private readonly userSyncService: UserSyncService,
  ) {}

  async canActivate(
    context: ExecutionContext,
  ): Promise<boolean> {
    const request =
      context
        .switchToHttp()
        .getRequest<AuthenticatedRequest>();

    const firebaseUser =
      request.firebaseUser;

    if (!firebaseUser?.uid) {
      throw new UnauthorizedException(
        'Authenticated Firebase user is required',
      );
    }

    const applicationUser =
      await this.userSyncService.getOrCreateUser(
        {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
        },
      );

    request.user = applicationUser;

    return true;
  }
}