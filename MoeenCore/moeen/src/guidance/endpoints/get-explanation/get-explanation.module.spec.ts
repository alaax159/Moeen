import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { AuthModule } from '../../../auth/auth.module';
import { DatabaseModule } from '../../../database/database.module';
import { UsersModule } from '../../../users/users.module';
import { SAFETY_RESULT_PORT } from '../../adapters/safety-result-adapter/safety-result-adapter.port';
import { SafetyResultAdapter } from '../../adapters/safety-result-adapter/safety-result-adapter.service';
import { FALLBACK_RENDERER_PORT } from '../../generation/fallback-renderer/fallback-renderer.port';
import { FallbackRenderer } from '../../generation/fallback-renderer/fallback-renderer.service';
import { GetExplanationModule } from './get-explanation.module';
import { GetExplanationService } from './get-explanation.service';

describe('GetExplanationModule', () => {
  it('wires the current safety adapter and shared fallback into the endpoint', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        DatabaseModule,
        AuthModule,
        UsersModule,
        GetExplanationModule,
      ],
    }).compile();

    expect(moduleRef.get(GetExplanationService)).toBeInstanceOf(
      GetExplanationService,
    );
    expect(moduleRef.get(SAFETY_RESULT_PORT)).toBeInstanceOf(
      SafetyResultAdapter,
    );
    expect(moduleRef.get(FALLBACK_RENDERER_PORT)).toBeInstanceOf(
      FallbackRenderer,
    );
  });
});
