import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';

import { Request } from 'express';

import type { DecodedIdToken } from 'firebase-admin/auth';

export type FirebaseUserIdentity = {
  uid: string;
  email?: string;
};

type AuthenticatedRequest = Request & {
  firebaseUser?: DecodedIdToken;
};

export const CurrentFirebaseUid =
  createParamDecorator(
    (
      _data: unknown,
      context: ExecutionContext,
    ): string => {
      const request =
        context
          .switchToHttp()
          .getRequest<AuthenticatedRequest>();

      const firebaseUid =
        request.firebaseUser?.uid;

      if (!firebaseUid) {
        throw new UnauthorizedException(
          'Authenticated Firebase user is required',
        );
      }

      return firebaseUid;
    },
  );

export const CurrentFirebaseUser =
  createParamDecorator(
    (
      _data: unknown,
      context: ExecutionContext,
    ): FirebaseUserIdentity => {
      const request =
        context
          .switchToHttp()
          .getRequest<AuthenticatedRequest>();

      const {
        uid,
        email,
      } = request.firebaseUser ?? {};

      if (!uid) {
        throw new UnauthorizedException(
          'Authenticated Firebase user is required',
        );
      }

      return {
        uid,
        email,
      };
    },
  );