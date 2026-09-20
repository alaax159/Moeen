import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';

import {
  EmergencyAccessAuditAction,
  EmergencyAccessAuditRepository,
} from '../database/repository/emergency-access-audit.repository';
import {
  EmergencyAccess,
  EmergencyAccessRepository,
} from '../database/repository/emergency-access.repository';
import {
  EmergencyAccessEnableDto,
  EmergencyAccessStatusDto,
  EmergencyAccessTokenDto,
} from './dto/emergency-access.dto';

/** Bounded retry on the best-effort audit write. Shape follows LlmCallExecutor. */
const AUDIT_WRITE_MAX_ATTEMPTS = 3;
const AUDIT_WRITE_RETRY_DELAY_MS = 100;

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable()
export class EmergencyAccessService {
  private readonly logger = new Logger(EmergencyAccessService.name);

  constructor(
    private readonly repository: EmergencyAccessRepository,
    private readonly auditRepository: EmergencyAccessAuditRepository,
  ) {}

  async getStatus(userId: number): Promise<EmergencyAccessStatusDto> {
    const access = await this.repository.findByUserId(userId);
    return access
      ? this.toStatus(access)
      : { enabled: false, configured: false, version: 0, updatedAt: null };
  }

  async enable(
    userId: number,
    expectedVersion?: number,
  ): Promise<EmergencyAccessEnableDto> {
    const current = await this.repository.findByUserId(userId);

    if (current?.enabled) {
      return this.toEnableStatus(current);
    }

    if (current && expectedVersion !== current.version) {
      throw this.versionConflict();
    }

    const token = this.generateToken();
    const tokenHash = this.hashToken(token);
    const access = current
      ? await this.repository.reEnable(userId, current.version, tokenHash)
      : await this.repository.createEnabled(userId, tokenHash);

    if (!access) {
      if (current) throw this.versionConflict();

      const concurrentlyCreated = await this.repository.findByUserId(userId);
      if (!concurrentlyCreated) {
        throw new Error('Emergency access state could not be read');
      }
      return this.toEnableStatus(concurrentlyCreated);
    }

    await this.recordAccessEvent(userId, 'enabled');

    return {
      enabled: true,
      tokenGenerated: true,
      token,
      version: access.version,
      updatedAt: access.updatedAt.toISOString(),
    };
  }

  async regenerate(
    userId: number,
    expectedVersion: number,
  ): Promise<EmergencyAccessTokenDto> {
    const token = this.generateToken();
    const access = await this.repository.regenerate(
      userId,
      expectedVersion,
      this.hashToken(token),
    );

    if (!access) throw this.versionConflict();

    await this.recordAccessEvent(userId, 'regenerated');

    return {
      enabled: true,
      token,
      version: access.version,
      updatedAt: access.updatedAt.toISOString(),
    };
  }

  async disable(
    userId: number,
    expectedVersion: number,
  ): Promise<EmergencyAccessStatusDto> {
    const access = await this.repository.disable(userId, expectedVersion);
    if (!access) throw this.versionConflict();

    await this.recordAccessEvent(userId, 'disabled');

    return this.toStatus(access);
  }

  /**
   * Best-effort audit write, run after the mutation has already committed.
   * Retries a few times on a transient failure, then logs and gives up — a
   * lost audit row must not turn a successful revoke/regenerate into an error
   * for the user (the reconciliation cron is the backstop for that case).
   * Mirrors LlmCallExecutor's retry shape and DoseNotificationProcessor's
   * catch-and-log.
   */
  private async recordAccessEvent(
    userId: number,
    action: EmergencyAccessAuditAction,
  ): Promise<void> {
    for (let attempt = 1; attempt <= AUDIT_WRITE_MAX_ATTEMPTS; attempt += 1) {
      try {
        await this.auditRepository.recordAccessEvent(userId, action);
        return;
      } catch (error) {
        if (attempt < AUDIT_WRITE_MAX_ATTEMPTS) {
          this.logger.warn(
            `emergency_access_audit write attempt ${attempt}/${AUDIT_WRITE_MAX_ATTEMPTS} ` +
              `failed (userId=${userId}, action=${action}); retrying`,
          );
          await sleep(AUDIT_WRITE_RETRY_DELAY_MS);
          continue;
        }
        this.logger.error(
          `Failed to write emergency_access_audit entry after ` +
            `${AUDIT_WRITE_MAX_ATTEMPTS} attempts (userId=${userId}, action=${action})`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  private toStatus(access: EmergencyAccess): EmergencyAccessStatusDto {
    return {
      enabled: access.enabled,
      configured: true,
      version: access.version,
      updatedAt: access.updatedAt.toISOString(),
    };
  }

  private toEnableStatus(access: EmergencyAccess): EmergencyAccessEnableDto {
    return {
      enabled: access.enabled,
      tokenGenerated: false,
      version: access.version,
      updatedAt: access.updatedAt.toISOString(),
    };
  }

  private versionConflict(): ConflictException {
    return new ConflictException(
      'Emergency access changed; refresh status and try again',
    );
  }

  private generateToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }
}
