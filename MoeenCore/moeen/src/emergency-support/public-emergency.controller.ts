import {
  Controller,
  Headers,
  HttpCode,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

import { EmergencyMedicalCardDto } from './dto/emergency-medical-card.dto';
import { PublicEmergencyCardService } from './public-emergency-card.service';
import { PublicEmergencyRateLimitGuard } from './public-emergency-rate-limit.guard';

const BEARER_PATTERN = /^Bearer ([A-Za-z0-9_-]{43})$/;
const NOT_FOUND_MESSAGE = 'Emergency card not found';

@ApiTags('emergency-public')
@Controller('api/emergency/public')
@UseGuards(PublicEmergencyRateLimitGuard)
export class PublicEmergencyController {
  constructor(
    private readonly publicEmergencyCard: PublicEmergencyCardService,
  ) {}

  @Post('card')
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOkResponse({ type: EmergencyMedicalCardDto })
  @ApiNotFoundResponse({ description: 'Emergency card not found' })
  getEmergencyCard(
    @Headers('authorization') authorization?: string,
  ): Promise<EmergencyMedicalCardDto> {
    const token = BEARER_PATTERN.exec(authorization ?? '')?.[1];
    if (!token) throw new NotFoundException(NOT_FOUND_MESSAGE);

    return this.publicEmergencyCard.getCard(token);
  }
}
