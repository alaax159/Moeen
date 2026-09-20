import { createQueueDashboardMiddleware } from './queue-dashboard.middleware';

function response() {
  const result = {
    setHeader: jest.fn(),
    status: jest.fn(),
    end: jest.fn(),
  };
  result.status.mockReturnValue(result);
  return result;
}

function basic(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

describe('queue dashboard access middleware', () => {
  it('fails closed with 404 while the dashboard is disabled', () => {
    const middleware = createQueueDashboardMiddleware({ enabled: false });
    const res = response();
    const next = jest.fn();

    middleware({ headers: {} } as never, res as never, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  it('refuses to enable the dashboard without both credentials', () => {
    expect(() =>
      createQueueDashboardMiddleware({
        enabled: true,
        username: 'admin',
      }),
    ).toThrow(/username and queue_dashboard_password/i);
  });

  it('refuses a weak dashboard password', () => {
    expect(() =>
      createQueueDashboardMiddleware({
        enabled: true,
        username: 'admin',
        password: 'too-short',
      }),
    ).toThrow(/at least 16 characters/i);
  });

  it.each([
    undefined,
    'Bearer token',
    basic('admin', 'wrong-password-value'),
    basic('wrong-user', 'strong-password-value'),
  ])(
    'returns an authentication challenge for invalid credentials (%s)',
    (authorization) => {
      const middleware = createQueueDashboardMiddleware({
        enabled: true,
        username: 'admin',
        password: 'strong-password-value',
      });
      const res = response();
      const next = jest.fn();

      middleware(
        { headers: authorization ? { authorization } : {} } as never,
        res as never,
        next,
      );

      expect(res.setHeader).toHaveBeenCalledWith(
        'WWW-Authenticate',
        'Basic realm="queue-dashboard"',
      );
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    },
  );

  it('admits the configured credentials without exposing them', () => {
    const middleware = createQueueDashboardMiddleware({
      enabled: true,
      username: 'admin',
      password: 'strong-password-value',
    });
    const res = response();
    const next = jest.fn();

    middleware(
      {
        headers: { authorization: basic('admin', 'strong-password-value') },
      } as never,
      res as never,
      next,
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});
