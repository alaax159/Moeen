import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  PayloadTooLargeException,
} from '@nestjs/common';
import { Response } from 'express';

@Catch(PayloadTooLargeException)
export class PrescriptionUploadExceptionFilter implements ExceptionFilter {
  catch(_exception: PayloadTooLargeException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const safeException = new PayloadTooLargeException(
      'The prescription file is too large',
    );

    response
      .status(safeException.getStatus())
      .json(safeException.getResponse());
  }
}
