import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import { CurrentFirebaseUid } from '../auth/current-firebase-uid.decorator';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { UserSyncGuard } from '../users/user-sync.guard';
import { ConfirmPrescriptionDto } from './dto/confirm-prescription.dto';
import { ConfirmPrescriptionResponseDto } from './dto/confirm-prescription-response.dto';
import { PrescriptionScanResponseDto } from './dto/prescription-scan-response.dto';
import { PrescriptionConfirmationService } from './prescription-confirmation.service';
import { PrescriptionFileValidationPipe } from './prescription-file-validation.pipe';
import { PrescriptionService } from './prescription.service';
import { PrescriptionUpload } from './prescription-upload';
import { PrescriptionUploadExceptionFilter } from './prescription-upload-exception.filter';

@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard, UserSyncGuard)
@Controller('api/prescriptions')
export class PrescriptionController {
  constructor(
    private readonly prescriptionService: PrescriptionService,
    private readonly prescriptionConfirmationService: PrescriptionConfirmationService,
  ) {}

  @Post('scan')
  @UseInterceptors(FileInterceptor('file'))
  @UseFilters(PrescriptionUploadExceptionFilter)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiCreatedResponse({ type: PrescriptionScanResponseDto })
  scan(
    @UploadedFile(PrescriptionFileValidationPipe) file: PrescriptionUpload,
  ): Promise<PrescriptionScanResponseDto> {
    return this.prescriptionService.scanPrescription(file);
  }

  // Confirms the medications the user reviewed on the prescription review
  // screen. Each medication is added through the existing add-medication flow,
  // so safety checks and dose scheduling behave exactly as a manual add.
  @Post('confirm')
  @ApiCreatedResponse({ type: ConfirmPrescriptionResponseDto })
  confirm(
    @CurrentFirebaseUid() firebaseUid: string,
    @Body() dto: ConfirmPrescriptionDto,
  ): Promise<ConfirmPrescriptionResponseDto> {
    return this.prescriptionConfirmationService.confirmPrescription(
      dto,
      firebaseUid,
    );
  }
}
