import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { EmergencyContactRepository } from '../../database/repository/emergency-contact.repository';
import {
  CreateEmergencyContactDto,
  UpdateEmergencyContactDto,
} from './dto/emergency-contact.dto';

@Injectable()
export class EmergencyContactsService {
  constructor(
    private readonly emergencyContactRepository: EmergencyContactRepository,
  ) {}

  list(userId: number) {
    return this.emergencyContactRepository.listByUserId(userId);
  }

  create(userId: number, dto: CreateEmergencyContactDto) {
    return this.emergencyContactRepository.create(userId, {
      name: dto.name,
      phone: dto.phone,
      relationship: dto.relationship,
    });
  }

  async update(userId: number, id: number, dto: UpdateEmergencyContactDto) {
    if (
      dto.name === undefined &&
      dto.phone === undefined &&
      dto.relationship === undefined
    ) {
      throw new BadRequestException('At least one field is required');
    }

    const updated = await this.emergencyContactRepository.update(userId, id, dto);

    if (!updated) {
      throw new NotFoundException('Emergency contact was not found');
    }

    return updated;
  }

  async delete(userId: number, id: number) {
    const result = await this.emergencyContactRepository.delete(userId, id);

    if (result.outcome === 'not_found') {
      throw new NotFoundException('Emergency contact was not found');
    }

    if (result.outcome === 'last') {
      throw new ConflictException('Cannot delete the only emergency contact');
    }
  }

  async setPrimary(userId: number, id: number) {
    const updated = await this.emergencyContactRepository.setPrimary(userId, id);

    if (!updated) {
      throw new NotFoundException('Emergency contact was not found');
    }

    return updated;
  }
}
