import { INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';

import { isSwaggerEnabled } from './swagger';

interface RuntimeEnvironment {
  CORS_ORIGINS?: string;
  SWAGGER_ENABLED?: string;
}

export { isSwaggerEnabled };

export function allowedCorsOrigins(environment: RuntimeEnvironment): string[] {
  const origins = [
    ...new Set(
      (environment.CORS_ORIGINS ?? '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  ];

  if (origins.includes('*')) {
    throw new Error(
      'CORS_ORIGINS must list explicit origins; wildcard access is not allowed',
    );
  }

  return origins;
}

export function createRequestValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    stopAtFirstError: true,
  });
}

export function configureHttpSecurity(
  app: INestApplication,
  environment: RuntimeEnvironment,
): void {
  // Swagger UI requires inline scripts/styles. Its route is explicit opt-in;
  // when it is enabled, keep every other Helmet header and disable CSP only.
  app.use(
    helmet(
      isSwaggerEnabled(environment) ? { contentSecurityPolicy: false } : {},
    ),
  );
  app.useGlobalPipes(createRequestValidationPipe());

  const origins = allowedCorsOrigins(environment);
  if (origins.length > 0) {
    app.enableCors({
      origin: origins,
      methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Authorization', 'Content-Type'],
      maxAge: 600,
    });
  }
}
