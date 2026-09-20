import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class PublicEmergencySecurityHeadersMiddleware implements NestMiddleware {
  use(_request: Request, response: Response, next: NextFunction): void {
    response.setHeader('Cache-Control', 'no-store, private');
    response.setHeader('Pragma', 'no-cache');
    response.setHeader('Referrer-Policy', 'no-referrer');
    next();
  }
}
