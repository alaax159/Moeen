import { Injectable } from '@nestjs/common';

import {
  GuidanceRequest,
  GuidanceResponse,
  PatientScope,
  RetrievalResult,
} from '../contracts';
import { ProviderDispatchResult } from '../generation/provider-gateway/provider-gateway.port';
import { AssembledPrompt, AssemblerPort } from './assembler.port';
import { ValidatorPort } from './validator.port';

@Injectable()
export class NotImplementedAssembler implements AssemblerPort {
  async assemble(
    _scope: PatientScope,
    _retrieval: RetrievalResult,
    _request: GuidanceRequest,
  ): Promise<AssembledPrompt> {
    throw new Error('AssemblerPort not implemented — pending GN-1');
  }
}

@Injectable()
export class NotImplementedValidator implements ValidatorPort {
  async validate(
    _dispatch: ProviderDispatchResult,
    _retrieval: RetrievalResult,
    _promptVersion: string,
  ): Promise<GuidanceResponse> {
    throw new Error('ValidatorPort not implemented — pending GN-3');
  }
}
