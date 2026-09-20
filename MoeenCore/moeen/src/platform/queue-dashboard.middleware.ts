import type { ConfigService } from '@nestjs/config';
import type { RequestHandler } from 'express';

import {
  matchesCredentials,
  parseBasicCredentials,
  requireCredentials,
} from './basic-auth';

interface DashboardAccess {
  enabled: boolean;
  username?: string;
  password?: string;
}

export function queueDashboardMiddlewareFromConfig(
  config: Pick<ConfigService, 'get'>,
): RequestHandler {
  return createQueueDashboardMiddleware({
    enabled: config.get<string>('QUEUE_DASHBOARD_ENABLED') === 'true',
    username: config.get<string>('QUEUE_DASHBOARD_USERNAME'),
    password: config.get<string>('QUEUE_DASHBOARD_PASSWORD'),
  });
}

export function createQueueDashboardMiddleware(
  access: DashboardAccess,
): RequestHandler {
  const expected = access.enabled
    ? requireCredentials(
        access.username,
        access.password,
        'QUEUE_DASHBOARD_USERNAME and QUEUE_DASHBOARD_PASSWORD',
      )
    : { username: '', password: '' };

  return (request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');

    if (!access.enabled) {
      response.status(404).end();
      return;
    }

    const authorized = matchesCredentials(
      parseBasicCredentials(request.headers.authorization),
      expected,
    );

    if (!authorized) {
      response.setHeader('WWW-Authenticate', 'Basic realm="queue-dashboard"');
      response.status(401).end();
      return;
    }

    next();
  };
}
