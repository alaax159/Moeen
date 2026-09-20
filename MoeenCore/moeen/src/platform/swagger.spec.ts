import type { Server } from 'node:http';

import { Controller, Get } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { setupSwagger } from './swagger';

@Controller('swagger-probe')
class SwaggerProbeController {
  @Get()
  probe() {
    return { ok: true };
  }
}

const CREDENTIALS = {
  SWAGGER_ENABLED: 'true',
  SWAGGER_USERNAME: 'docs-reader',
  SWAGGER_PASSWORD: 'a-sufficiently-long-password',
};

function basic(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

async function appWith(environment: Record<string, string>) {
  const moduleRef = await Test.createTestingModule({
    controllers: [SwaggerProbeController],
  }).compile();
  const app = moduleRef.createNestApplication();
  setupSwagger(app, environment);
  await app.init();
  return app;
}

describe('Swagger surface', () => {
  it('does not mount /docs at all while Swagger is disabled', async () => {
    const app = await appWith({});

    await request(app.getHttpServer() as Server)
      .get('/docs')
      .expect(404);

    await app.close();
  });

  it('refuses to enable Swagger without credentials to put in front of it', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SwaggerProbeController],
    }).compile();
    const app = moduleRef.createNestApplication();

    expect(() => setupSwagger(app, { SWAGGER_ENABLED: 'true' })).toThrow(
      /SWAGGER_USERNAME and SWAGGER_PASSWORD/i,
    );

    await app.close();
  });

  it.each([
    undefined,
    'Bearer token',
    basic('docs-reader', 'wrong-password-entirely'),
    basic('wrong-reader', 'a-sufficiently-long-password'),
  ])(
    'challenges an enabled /docs for invalid credentials (%s)',
    async (authorization) => {
      const app = await appWith(CREDENTIALS);

      const probe = request(app.getHttpServer() as Server).get('/docs');
      const response = await (authorization
        ? probe.set('Authorization', authorization)
        : probe);

      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toMatch(/^Basic /);
      expect(response.text).not.toMatch(/swagger/i);

      await app.close();
    },
  );

  it('serves the documentation once valid credentials are supplied', async () => {
    const app = await appWith(CREDENTIALS);

    const response = await request(app.getHttpServer() as Server)
      .get('/docs')
      .set(
        'Authorization',
        basic('docs-reader', 'a-sufficiently-long-password'),
      )
      .expect(200);

    expect(response.text).toMatch(/swagger/i);

    await app.close();
  });

  it('protects the generated OpenAPI document, not only the UI shell', async () => {
    const app = await appWith(CREDENTIALS);

    await request(app.getHttpServer() as Server)
      .get('/docs-json')
      .expect(401);

    await app.close();
  });
});
