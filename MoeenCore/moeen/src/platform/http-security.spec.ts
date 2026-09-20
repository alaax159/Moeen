import type { Server } from 'node:http';

import { BadRequestException, Controller, Get } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IsString } from 'class-validator';
import request from 'supertest';

import {
  allowedCorsOrigins,
  configureHttpSecurity,
  createRequestValidationPipe,
  isSwaggerEnabled,
} from './http-security';

class RequestDto {
  @IsString()
  name!: string;
}

@Controller('security-probe')
class SecurityProbeController {
  @Get()
  probe() {
    return { ok: true };
  }
}

describe('HTTP security configuration', () => {
  it('makes Swagger an explicit opt-in surface', () => {
    expect(isSwaggerEnabled({})).toBe(false);
    expect(isSwaggerEnabled({ SWAGGER_ENABLED: 'false' })).toBe(false);
    expect(isSwaggerEnabled({ SWAGGER_ENABLED: 'true' })).toBe(true);
  });

  it('normalizes an explicit CORS allowlist and rejects wildcard access', () => {
    expect(
      allowedCorsOrigins({
        CORS_ORIGINS:
          'https://app.example, https://admin.example,https://app.example',
      }),
    ).toEqual(['https://app.example', 'https://admin.example']);
    expect(() => allowedCorsOrigins({ CORS_ORIGINS: '*' })).toThrow(
      /explicit origins/i,
    );
  });

  it('rejects unknown request properties instead of silently accepting them', async () => {
    const pipe = createRequestValidationPipe();
    let rejection: unknown;

    try {
      await pipe.transform(
        { name: 'Alaa', unexpected: 'value' },
        { type: 'body', metatype: RequestDto },
      );
    } catch (error) {
      rejection = error;
    }

    expect(rejection).toBeInstanceOf(BadRequestException);
    const response = (rejection as BadRequestException).getResponse();
    expect(response).toHaveProperty('message');
    const message: unknown = (response as { message: unknown }).message;
    expect(message).toContain('property unexpected should not exist');
  });

  it('emits security headers without opening CORS by default', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SecurityProbeController],
    }).compile();
    const app = moduleRef.createNestApplication();
    configureHttpSecurity(app, {});
    await app.init();

    const response = await request(app.getHttpServer() as Server)
      .get('/security-probe')
      .set('Origin', 'https://untrusted.example')
      .expect(200);

    expect(response.headers['content-security-policy']).toBeDefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['access-control-allow-origin']).toBeUndefined();

    await app.close();
  });
});
