export const PRESCRIPTION_OCR_PROVIDER = Symbol('PRESCRIPTION_OCR_PROVIDER');

export interface PrescriptionOcrResult {
  text: string;
  confidence?: number;
}

export interface PrescriptionOcrProvider {
  extract(file: Buffer, mimeType: string): Promise<PrescriptionOcrResult>;
}

export class PrescriptionOcrUnavailableError extends Error {}

export class PrescriptionOcrTimeoutError extends Error {}
