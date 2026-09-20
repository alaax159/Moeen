import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NextFunction, Request, Response } from 'express';

import { parseEmergencyResponderOrigin } from '../config/emergency-responder-origin.config';

const ALLOWED_METHODS = 'POST, OPTIONS';
const ALLOWED_HEADERS = 'Authorization, Content-Type';

@Injectable()
export class PublicEmergencyCorsMiddleware implements NestMiddleware {
  private readonly responderOrigin: string | null;

  constructor(config: ConfigService) {
    this.responderOrigin = parseEmergencyResponderOrigin(
      config.get<string>('EMERGENCY_RESPONDER_ORIGIN'),
    );
  }

  use(request: Request, response: Response, next: NextFunction): void {
    const requestOrigin = request.get('Origin');

    // Same-origin requests do not need CORS response headers.
    if (!this.responderOrigin) {
      next();
      return;
    }

    if (requestOrigin && requestOrigin !== this.responderOrigin) {
      response.status(403).end();
      return;
    }

    if (requestOrigin === this.responderOrigin) {
      response.setHeader('Access-Control-Allow-Origin', this.responderOrigin);
      response.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS);
      response.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS);
      response.setHeader('Vary', 'Origin');
    }

    if (request.method === 'OPTIONS') {
      response.status(requestOrigin === this.responderOrigin ? 204 : 403).end();
      return;
    }

    next();
  }
}
