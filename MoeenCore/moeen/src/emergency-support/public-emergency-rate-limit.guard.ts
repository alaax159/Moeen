import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Request, Response } from 'express';

import { PublicEmergencyRateLimiter } from './public-emergency-rate-limiter.service';

@Injectable()
export class PublicEmergencyRateLimitGuard implements CanActivate {
  constructor(private readonly rateLimiter: PublicEmergencyRateLimiter) {}

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const decision = this.rateLimiter.consume(request.ip ?? 'unknown');

    if (decision.allowed) return true;

    response.setHeader('Retry-After', String(decision.retryAfterSeconds));
    throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
  }
}
