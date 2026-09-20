import {
  INestApplication,
  MiddlewareConsumer,
  Module,
  NestModule,
  NotFoundException,
  RequestMethod,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Server } from 'node:http';
import request from 'supertest';

import { PublicEmergencyCardService } from './public-emergency-card.service';
import { PublicEmergencyCorsMiddleware } from './public-emergency-cors.middleware';
import { PublicEmergencyController } from './public-emergency.controller';
import { PublicEmergencyRateLimitGuard } from './public-emergency-rate-limit.guard';
import { PublicEmergencyRateLimiter } from './public-emergency-rate-limiter.service';
import { PublicEmergencySecurityHeadersMiddleware } from './public-emergency-security-headers.middleware';

const cardService = { getCard: jest.fn() };
const configService = { get: jest.fn() };

@Module({
  controllers: [PublicEmergencyController],
  providers: [
    { provide: PublicEmergencyCardService, useValue: cardService },
    { provide: ConfigService, useValue: configService },
    PublicEmergencyRateLimiter,
    PublicEmergencyRateLimitGuard,
    PublicEmergencyCorsMiddleware,
    PublicEmergencySecurityHeadersMiddleware,
  ],
})
class PublicEmergencyTestModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(
        PublicEmergencySecurityHeadersMiddleware,
        PublicEmergencyCorsMiddleware,
      )
      .forRoutes({
        path: 'api/emergency/public/card',
        method: RequestMethod.ALL,
      });
  }
}

describe('PublicEmergencyController', () => {
  let app: INestApplication;
  let server: Server;

  const token = 'A'.repeat(43);

  const card = {
    patient: {
      firstName: 'Maya',
      lastName: null,
      dateOfBirth: null,
      gender: null,
      bloodType: null,
    },
    allergies: [],
    chronicConditions: [],
    medications: [],
    emergencyContacts: [],
    lastUpdated: null,
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    configService.get.mockImplementation((key: string) => {
      if (key === 'EMERGENCY_PUBLIC_RATE_LIMIT') {
        return '1';
      }

      if (key === 'EMERGENCY_RESPONDER_ORIGIN') {
        return 'https://responder.example';
      }

      return '60000';
    });

    cardService.getCard.mockResolvedValue(card);

    const moduleRef = await Test.createTestingModule({
      imports: [PublicEmergencyTestModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    server = app.getHttpServer() as Server;
  });

  afterEach(async () => {
    await app.close();
  });

  it('is public, returns only the card, and prevents caching/referrer leakage', async () => {
    const response = await request(server)
      .post('/api/emergency/public/card')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual(card);
    expect(cardService.getCard).toHaveBeenCalledWith(token);
    expect(response.headers['cache-control']).toBe('no-store, private');
    expect(response.headers.pragma).toBe('no-cache');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
  });

  it('applies the security headers to generic 404 responses', async () => {
    cardService.getCard.mockRejectedValueOnce(
      new NotFoundException('Emergency card not found'),
    );

    const response = await request(server)
      .post('/api/emergency/public/card')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    expect((response.body as { message: string }).message).toBe(
      'Emergency card not found',
    );

    expect(response.headers['cache-control']).toBe('no-store, private');
    expect(response.headers.pragma).toBe('no-cache');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
  });

  it('allows responder preflight with only the required method and headers', async () => {
    const response = await request(server)
      .options('/api/emergency/public/card')
      .set('Origin', 'https://responder.example')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization,content-type')
      .expect(204);

    expect(response.headers['access-control-allow-origin']).toBe(
      'https://responder.example',
    );

    expect(response.headers['access-control-allow-methods']).toBe(
      'POST, OPTIONS',
    );

    expect(response.headers['access-control-allow-headers']).toBe(
      'Authorization, Content-Type',
    );

    expect(
      response.headers['access-control-allow-credentials'],
    ).toBeUndefined();

    expect(response.headers['cache-control']).toBe('no-store, private');
    expect(cardService.getCard).not.toHaveBeenCalled();
  });

  it('rejects an unknown responder origin', async () => {
    const response = await request(server)
      .options('/api/emergency/public/card')
      .set('Origin', 'https://unknown.example')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization')
      .expect(403);

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(response.headers['cache-control']).toBe('no-store, private');
    expect(cardService.getCard).not.toHaveBeenCalled();
  });

  it('accepts the Authorization POST from the allowed origin after preflight', async () => {
    await request(server)
      .options('/api/emergency/public/card')
      .set('Origin', 'https://responder.example')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization')
      .expect(204);

    const response = await request(server)
      .post('/api/emergency/public/card')
      .set('Origin', 'https://responder.example')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual(card);

    expect(response.headers['access-control-allow-origin']).toBe(
      'https://responder.example',
    );

    expect(cardService.getCard).toHaveBeenCalledWith(token);
  });

  it.each([
    undefined,
    token,
    `bearer ${token}`,
    `Bearer  ${token}`,
    `Bearer ${token}=`,
  ])(
    'returns the generic 404 for non-canonical authorization %s',
    async (value) => {
      let pendingRequest = request(server).post(
        '/api/emergency/public/card',
      );

      if (value !== undefined) {
        pendingRequest = pendingRequest.set('Authorization', value);
      }

      const response = await pendingRequest.expect(404);

      expect((response.body as { message: string }).message).toBe(
        'Emergency card not found',
      );

      expect(cardService.getCard).not.toHaveBeenCalled();
      expect(response.headers['cache-control']).toBe('no-store, private');
    },
  );

  it('does not expose the token-bearing GET route', async () => {
    await request(server)
      .get(`/api/emergency/public/${token}`)
      .expect(404);

    expect(cardService.getCard).not.toHaveBeenCalled();
  });

  it('rate limits by request.ip before card aggregation', async () => {
    await request(server)
      .post('/api/emergency/public/card')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const response = await request(server)
      .post('/api/emergency/public/card')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Forwarded-For', '198.51.100.10')
      .expect(429);

    expect(cardService.getCard).toHaveBeenCalledTimes(1);
    expect(response.headers['cache-control']).toBe('no-store, private');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['retry-after']).toBe('60');
  });
});