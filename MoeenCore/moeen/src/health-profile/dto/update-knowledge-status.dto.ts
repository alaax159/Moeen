import { IsEnum } from 'class-validator';

import { HealthKnowledgeStatus } from './save-personal-info.dto';

export class UpdateKnowledgeStatusDto {
  @IsEnum(HealthKnowledgeStatus)
  allergyKnowledgeStatus!: HealthKnowledgeStatus;

  @IsEnum(HealthKnowledgeStatus)
  conditionKnowledgeStatus!: HealthKnowledgeStatus;
}
