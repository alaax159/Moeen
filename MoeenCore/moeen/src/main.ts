import './set-process-timezone'; // must stay first — see file for why
import { NestFactory } from '@nestjs/core';
import { Express } from 'express';

import { AppModule } from './app.module';
import { parseTrustProxyHops } from './config/trust-proxy.config';
import { configureHttpSecurity } from './platform/http-security';
import { setupSwagger } from './platform/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const trustProxyHops = parseTrustProxyHops(process.env.TRUST_PROXY_HOPS);
  if (trustProxyHops > 0) {
    const expressApp = app.getHttpAdapter().getInstance() as Express;
    expressApp.set('trust proxy', trustProxyHops);
  }
  configureHttpSecurity(app, process.env);
  setupSwagger(app, process.env);

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
