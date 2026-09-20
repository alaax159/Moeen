import { Module } from '@nestjs/common';

import { FallbackRenderer } from './fallback-renderer.service';
import { FALLBACK_RENDERER_PORT } from './fallback-renderer.port';

/**
 * No imports, and it never will have any. The moment this module needs a
 * config service, a repository or an HTTP client, the fallback has stopped
 * being the thing that always works.
 */
@Module({
  providers: [
    FallbackRenderer,
    { provide: FALLBACK_RENDERER_PORT, useExisting: FallbackRenderer },
  ],
  exports: [FallbackRenderer, FALLBACK_RENDERER_PORT],
})
export class FallbackRendererModule {}
