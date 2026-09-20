import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { HealthProfileRepository } from '../../database/repository/health-profile.repository';
import { FirebaseUserIdentity } from '../../auth/current-firebase-uid.decorator';
import { SavePersonalInfoDto } from '../dto/save-personal-info.dto';
import { UpdateKnowledgeStatusDto } from '../dto/update-knowledge-status.dto';

@Injectable()
export class PersonalInfoService {
  constructor(
    private readonly healthProfileRepository: HealthProfileRepository,
  ) {}

  async create(firebaseUid: string) {
    const profile = await this.healthProfileRepository.create(firebaseUid);

    if (!profile) {
      throw new ConflictException('Health profile already exists');
    }

    return profile;
  }

  async get(firebaseUid: string) {
    const result =
      await this.healthProfileRepository.findByFirebaseUid(firebaseUid);

    if (!result) {
      throw new NotFoundException('Health profile was not found');
    }

    return {
      firstName: result.user.firstName,
      lastName: result.user.lastName,
      email: result.user.email,
      dateOfBirth: result.healthProfile.dateOfBirth,
      weightKg: result.healthProfile.weightKg,
      heightCm: result.healthProfile.heightCm,
      gender: result.healthProfile.gender,
      bloodType: result.healthProfile.bloodType,
      allergyKnowledgeStatus: result.healthProfile.allergyKnowledgeStatus,
      conditionKnowledgeStatus: result.healthProfile.conditionKnowledgeStatus,
      emergencyContactPhone: result.healthProfile.emergencyContactPhone,
      doctorName: result.healthProfile.doctorName,
      doctorPhone: result.healthProfile.doctorPhone,
      updatedAt: result.healthProfile.updatedAt,
    };
  }

  async getKnowledgeStatus(firebaseUid: string) {
    const profile =
      await this.healthProfileRepository.findByFirebaseUid(firebaseUid);

    if (!profile) {
      throw new NotFoundException('Health profile was not found');
    }

    return {
      allergyKnowledgeStatus: profile.healthProfile.allergyKnowledgeStatus,
      conditionKnowledgeStatus: profile.healthProfile.conditionKnowledgeStatus,
    };
  }

  async updateKnowledgeStatus(
    firebaseUid: string,
    dto: UpdateKnowledgeStatusDto,
  ) {
    const status = await this.healthProfileRepository.updateKnowledgeStatus(
      firebaseUid,
      dto,
    );

    if (!status) {
      throw new NotFoundException('Health profile was not found');
    }

    return status;
  }

  async updatePersonalInfo(
    firebaseUser: FirebaseUserIdentity,
    dto: SavePersonalInfoDto,
  ) {
    const today = new Date();
    today.setUTCHours(23, 59, 59, 999);

    if (new Date(`${dto.dateOfBirth}T00:00:00.000Z`) > today) {
      throw new BadRequestException('Date of birth cannot be in the future');
    }

    const result = await this.healthProfileRepository.savePersonalInfo(
      firebaseUser.uid,
      firebaseUser.email,
      dto,
    );

    if (!result) {
      throw new NotFoundException('Health profile was not found');
    }

    return {
      firstName: result.user.firstName,
      lastName: result.user.lastName,
      email: result.user.email,
      dateOfBirth: result.healthProfile.dateOfBirth,
      weightKg: result.healthProfile.weightKg,
      heightCm: result.healthProfile.heightCm,
      gender: result.healthProfile.gender,
      bloodType: result.healthProfile.bloodType,
      allergyKnowledgeStatus: result.healthProfile.allergyKnowledgeStatus,
      conditionKnowledgeStatus: result.healthProfile.conditionKnowledgeStatus,
      emergencyContactPhone: result.healthProfile.emergencyContactPhone,
      doctorName: result.healthProfile.doctorName,
      doctorPhone: result.healthProfile.doctorPhone,
      updatedAt: result.healthProfile.updatedAt,
    };
  }
}
