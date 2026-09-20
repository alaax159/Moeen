import { Logger, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { DecodedIdToken } from 'firebase-admin/auth';

import { FirebaseAuthGuard } from './firebase-auth.guard';

function contextFor(authorization?: string) {
  const request = {
    headers: authorization === undefined ? {} : { authorization },
  };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;

  return { context, request };
}

describe('FirebaseAuthGuard', () => {
  afterEach(() => jest.restoreAllMocks());

  it('verifies the exact bearer token and attaches the decoded identity', async () => {
    const decoded = { uid: 'firebase-user-1' } as DecodedIdToken;
    const firebaseAdmin = {
      verifyIdToken: jest.fn().mockResolvedValue(decoded),
    };
    const guard = new FirebaseAuthGuard(firebaseAdmin as never);
    const { context, request } = contextFor('Bearer signed-token');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(firebaseAdmin.verifyIdToken).toHaveBeenCalledWith('signed-token');
    expect(request).toHaveProperty('firebaseUser', decoded);
  });

  it.each([
    'Basic signed-token',
    'Bearer',
    'Bearer  signed-token',
    'Bearer signed-token trailing-data',
  ])(
    'rejects malformed credentials before verification (%s)',
    async (header) => {
      const firebaseAdmin = { verifyIdToken: jest.fn() };
      const guard = new FirebaseAuthGuard(firebaseAdmin as never);

      await expect(
        guard.canActivate(contextFor(header).context),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(firebaseAdmin.verifyIdToken).not.toHaveBeenCalled();
    },
  );

  it('does not copy verifier error details into logs or the response', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const firebaseAdmin = {
      verifyIdToken: jest
        .fn()
        .mockRejectedValue(new Error('secret token fragment and tenant name')),
    };
    const guard = new FirebaseAuthGuard(firebaseAdmin as never);

    await expect(
      guard.canActivate(contextFor('Bearer signed-token').context),
    ).rejects.toMatchObject({
      message: 'Invalid or expired Firebase ID token',
    });
    expect(warn).toHaveBeenCalledWith('Firebase ID token verification failed');
    expect(warn).not.toHaveBeenCalledWith(
      expect.stringContaining('secret token fragment'),
    );
  });
});
