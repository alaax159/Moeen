import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';

import type { Request } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';

import { FirebaseAdminService } from './firebase-admin.service';
import { parseBearerToken } from './bearer-token';

type AuthenticatedRequest = Request & {
  firebaseUser?: DecodedIdToken;
};

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(FirebaseAuthGuard.name);

  constructor(private readonly firebaseAdminService: FirebaseAdminService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const authorization = request.headers.authorization;

    if (!authorization) {
      throw new UnauthorizedException('Authorization header is required');
    }

    const token = parseBearerToken(authorization);

    if (!token) {
      throw new UnauthorizedException('Valid Bearer token is required');
    }

    try {
      const decodedToken = await this.firebaseAdminService.verifyIdToken(token);

      request.firebaseUser = decodedToken;

      return true;
    } catch {
      // Firebase errors are deliberately not interpolated: provider messages
      // are not part of the API contract and may contain token-derived or
      // infrastructure details that do not belong in application logs.
      this.logger.warn('Firebase ID token verification failed');

      throw new UnauthorizedException('Invalid or expired Firebase ID token');
    }
  }
}
