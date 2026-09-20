import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { RequestHandler } from 'express';

import {
  matchesCredentials,
  parseBasicCredentials,
  requireCredentials,
} from './basic-auth';

interface SwaggerEnvironment {
  SWAGGER_ENABLED?: string;
  SWAGGER_USERNAME?: string;
  SWAGGER_PASSWORD?: string;
}

const DOCS_PATH = 'docs';

/**
 * Every path SwaggerModule.setup('docs') claims. `/docs` covers the UI shell
 * and its assets; the JSON and YAML documents are siblings rather than
 * children of it, so guarding only `/docs` would leave the full API
 * description readable by anyone.
 */
const PROTECTED_PATHS = [
  `/${DOCS_PATH}`,
  `/${DOCS_PATH}-json`,
  `/${DOCS_PATH}-yaml`,
];

export function isSwaggerEnabled(environment: SwaggerEnvironment): boolean {
  return environment.SWAGGER_ENABLED === 'true';
}

/**
 * Mounts the API documentation behind HTTP basic authentication.
 *
 * `.addBearerAuth()` documents the scheme the API itself uses; it does not
 * protect this page. Swagger enumerates every route, its request shape and
 * its auth requirements, so an unauthenticated /docs hands an attacker the
 * map. The credential middleware is registered before SwaggerModule so it
 * runs first, and covers the JSON and YAML documents as well as the UI.
 *
 * Enabling Swagger without credentials throws at startup rather than
 * silently publishing the surface.
 */
export function setupSwagger(
  app: INestApplication,
  environment: SwaggerEnvironment,
): void {
  if (!isSwaggerEnabled(environment)) {
    return;
  }

  const expected = requireCredentials(
    environment.SWAGGER_USERNAME,
    environment.SWAGGER_PASSWORD,
    'SWAGGER_USERNAME and SWAGGER_PASSWORD',
  );

  app.use(PROTECTED_PATHS, createSwaggerAuthMiddleware(expected));

  const config = new DocumentBuilder()
    .setTitle('Moeen API')
    .setDescription('Moeen medication tracking API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  SwaggerModule.setup(
    DOCS_PATH,
    app,
    SwaggerModule.createDocument(app, config),
  );
}

function createSwaggerAuthMiddleware(
  expected: ReturnType<typeof requireCredentials>,
): RequestHandler {
  return (request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');

    if (
      matchesCredentials(
        parseBasicCredentials(request.headers.authorization),
        expected,
      )
    ) {
      next();
      return;
    }

    response.setHeader('WWW-Authenticate', 'Basic realm="api-docs"');
    response.status(401).end();
  };
}
