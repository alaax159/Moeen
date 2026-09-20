import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { FirebaseAuthGuard } from '../../auth/firebase-auth.guard';
import { CurrentUser } from '../../users/current-user.decorator';
import { UserSyncGuard } from '../../users/user-sync.guard';
import {
  CreateEmergencyContactDto,
  EmergencyContactResponseDto,
  UpdateEmergencyContactDto,
} from './dto/emergency-contact.dto';
import { EmergencyContactsService } from './emergency-contacts.service';

@ApiTags('emergency-support')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard, UserSyncGuard)
@Controller('api/emergency-support')
export class EmergencyContactsController {
  constructor(
    private readonly emergencyContactsService: EmergencyContactsService,
  ) {}

  @Get('contacts')
  @ApiOkResponse({ type: [EmergencyContactResponseDto] })
  list(@CurrentUser() user: { id: number }) {
    return this.emergencyContactsService.list(user.id);
  }

  @Post('contacts')
  @ApiOkResponse({ type: EmergencyContactResponseDto })
  create(
    @CurrentUser() user: { id: number },
    @Body() dto: CreateEmergencyContactDto,
  ) {
    return this.emergencyContactsService.create(user.id, dto);
  }

  @Put('contacts/:id')
  @ApiOkResponse({ type: EmergencyContactResponseDto })
  update(
    @CurrentUser() user: { id: number },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEmergencyContactDto,
  ) {
    return this.emergencyContactsService.update(user.id, id, dto);
  }

  @Delete('contacts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @CurrentUser() user: { id: number },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.emergencyContactsService.delete(user.id, id);
  }

  @Put('contacts/:id/primary')
  @ApiOkResponse({ type: EmergencyContactResponseDto })
  setPrimary(
    @CurrentUser() user: { id: number },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.emergencyContactsService.setPrimary(user.id, id);
  }
}
