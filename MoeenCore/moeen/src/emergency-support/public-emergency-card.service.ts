import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';

import { EmergencyAccessRepository } from '../database/repository/emergency-access.repository';
import { EmergencyMedicalCardDto } from './dto/emergency-medical-card.dto';
import { EmergencyMedicalCardService } from './emergency-medical-card.service';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const NOT_FOUND_MESSAGE = 'Emergency card not found';

@Injectable()
export class PublicEmergencyCardService {
  constructor(
    private readonly emergencyAccessRepository: EmergencyAccessRepository,
    private readonly emergencyMedicalCardService: EmergencyMedicalCardService,
  ) {}

  async getCard(rawToken: string): Promise<EmergencyMedicalCardDto> {
    const tokenHash = this.hashValidToken(rawToken);
    const initialOwner =
      await this.emergencyAccessRepository.findEnabledOwnerByTokenHash(
        tokenHash,
      );
    if (!initialOwner) throw this.notFound();

    const card = await this.emergencyMedicalCardService.getEmergencyMedicalCard(
      initialOwner.userId,
    );

    const revalidatedOwner =
      await this.emergencyAccessRepository.findEnabledOwnerByTokenHash(
        tokenHash,
      );
    if (!revalidatedOwner || revalidatedOwner.userId !== initialOwner.userId) {
      throw this.notFound();
    }

    return card;
  }

  private hashValidToken(rawToken: string): string {
    if (!TOKEN_PATTERN.test(rawToken)) throw this.notFound();

    const decoded = Buffer.from(rawToken, 'base64url');
    if (decoded.length !== 32 || decoded.toString('base64url') !== rawToken) {
      throw this.notFound();
    }

    return createHash('sha256').update(rawToken, 'utf8').digest('hex');
  }

  private notFound(): NotFoundException {
    return new NotFoundException(NOT_FOUND_MESSAGE);
  }
}
