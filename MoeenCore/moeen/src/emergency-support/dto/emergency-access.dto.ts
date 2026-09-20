import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, Min } from 'class-validator';

export class EmergencyAccessMutationDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion: number;
}

export class EnableEmergencyAccessDto {
  @ApiProperty({ minimum: 1, required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}

export class EmergencyAccessStatusDto {
  @ApiProperty()
  enabled: boolean;

  @ApiProperty()
  configured: boolean;

  @ApiProperty({ minimum: 0 })
  version: number;

  @ApiProperty({ nullable: true, type: String })
  updatedAt: string | null;
}

export class EmergencyAccessTokenDto {
  @ApiProperty({ enum: [true] })
  enabled: true;

  @ApiProperty({ description: 'Returned once; store it securely.' })
  token: string;

  @ApiProperty({ minimum: 1 })
  version: number;

  @ApiProperty()
  updatedAt: string;
}

export class EmergencyAccessEnableDto {
  @ApiProperty()
  enabled: boolean;

  @ApiProperty({ description: 'Whether this request generated a new token.' })
  tokenGenerated: boolean;

  @ApiProperty({ required: false, description: 'Present only when generated.' })
  token?: string;

  @ApiProperty({ minimum: 1 })
  version: number;

  @ApiProperty()
  updatedAt: string;
}
