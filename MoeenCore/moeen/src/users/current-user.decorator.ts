import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';

import { Request } from 'express';

type AuthenticatedRequest = Request & {
  user?: unknown;
};

export const CurrentUser =
  createParamDecorator(
    (
      _data: unknown,
      context: ExecutionContext,
    ) => {
      const request =
        context
          .switchToHttp()
          .getRequest<AuthenticatedRequest>();

      if (!request.user) {
        throw new UnauthorizedException(
          'Authenticated application user is required',
        );
      }

      return request.user;
    },
  );