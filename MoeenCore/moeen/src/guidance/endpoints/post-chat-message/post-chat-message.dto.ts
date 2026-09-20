import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class PostChatMessageDto {
  @IsUUID()
  requestId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  message!: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  sessionId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  subjectMedicationId?: number;
}
