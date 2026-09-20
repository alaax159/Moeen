import { Injectable } from '@nestjs/common';

import { DoseLogRepository } from './dose-log.repository';
import { DoseScheduleRepository } from './dose-schedule.repository';
import { MedicationRepository } from './medication.repository';
import { NotificationPreferencesRepository } from './notification-preferences.repository';
import { UserMedicationRepository } from './user-medication.repository';

/**
 * Compatibility facade for open pull requests that still import DatabaseRepository.
 * New database logic belongs in the specialized repositories.
 */
@Injectable()
export class DatabaseRepository {
  constructor(
    private readonly userMedicationRepository: UserMedicationRepository,
    private readonly doseLogRepository: DoseLogRepository,
    private readonly doseScheduleRepository: DoseScheduleRepository,
    private readonly notificationPreferencesRepository: NotificationPreferencesRepository,
    private readonly medicationRepository: MedicationRepository,
  ) {}

  getUserMedications(
    ...args: Parameters<UserMedicationRepository['getUserMedications']>
  ) {
    return this.userMedicationRepository.getUserMedications(...args);
  }

  archiveUserMedication(
    ...args: Parameters<UserMedicationRepository['archiveUserMedication']>
  ) {
    return this.userMedicationRepository.archiveUserMedication(...args);
  }

  insert_user_medication(
    ...args: Parameters<UserMedicationRepository['insert_user_medication']>
  ) {
    return this.userMedicationRepository.insert_user_medication(...args);
  }

  getDraftSafetyContext(
    ...args: Parameters<UserMedicationRepository['getDraftSafetyContext']>
  ) {
    return this.userMedicationRepository.getDraftSafetyContext(...args);
  }

  getActiveMedicationsByUserId(
    ...args: Parameters<
      UserMedicationRepository['getActiveMedicationsByUserId']
    >
  ) {
    return this.userMedicationRepository.getActiveMedicationsByUserId(...args);
  }

  updateUserMedication(
    ...args: Parameters<UserMedicationRepository['updateUserMedication']>
  ) {
    return this.userMedicationRepository.updateUserMedication(...args);
  }

  getMedicationById(
    ...args: Parameters<UserMedicationRepository['getMedicationById']>
  ) {
    return this.userMedicationRepository.getMedicationById(...args);
  }

  getTodayMedications(
    ...args: Parameters<DoseLogRepository['getTodayMedications']>
  ) {
    return this.doseLogRepository.getTodayMedications(...args);
  }

  getAdherenceSummary(
    ...args: Parameters<DoseLogRepository['getAdherenceSummary']>
  ) {
    return this.doseLogRepository.getAdherenceSummary(...args);
  }

  getWeeklyDoses(...args: Parameters<DoseLogRepository['getWeeklyDoses']>) {
    return this.doseLogRepository.getWeeklyDoses(...args);
  }

  insertDoseLogsForWindow(
    ...args: Parameters<DoseLogRepository['insertDoseLogsForWindow']>
  ) {
    return this.doseLogRepository.insertDoseLogsForWindow(...args);
  }

  getPendingDoseLogsForWindow(
    ...args: Parameters<DoseLogRepository['getPendingDoseLogsForWindow']>
  ) {
    return this.doseLogRepository.getPendingDoseLogsForWindow(...args);
  }

  getDoseLogStatus(...args: Parameters<DoseLogRepository['getDoseLogStatus']>) {
    return this.doseLogRepository.getDoseLogStatus(...args);
  }

  getDoseLogUserMedicationId(
    ...args: Parameters<DoseLogRepository['getDoseLogUserMedicationId']>
  ): Promise<number | null> {
    return this.doseLogRepository.getDoseLogUserMedicationId(...args);
  }

  setDoseNotifiedAt(
    ...args: Parameters<DoseLogRepository['setDoseNotifiedAt']>
  ) {
    return this.doseLogRepository.setDoseNotifiedAt(...args);
  }

  getMedicationDisplayInfo(
    ...args: Parameters<DoseLogRepository['getMedicationDisplayInfo']>
  ) {
    return this.doseLogRepository.getMedicationDisplayInfo(...args);
  }

  getDoseNotifiedAt(
    ...args: Parameters<DoseLogRepository['getDoseNotifiedAt']>
  ) {
    return this.doseLogRepository.getDoseNotifiedAt(...args);
  }

  markDoseMissedIfPending(
    ...args: Parameters<DoseLogRepository['markDoseMissedIfPending']>
  ): Promise<number | null> {
    return this.doseLogRepository.markDoseMissedIfPending(...args);
  }

  getPendingDoseLogIds(
    ...args: Parameters<DoseLogRepository['getPendingDoseLogIds']>
  ) {
    return this.doseLogRepository.getPendingDoseLogIds(...args);
  }

  deletePendingDoseLogs(
    ...args: Parameters<DoseLogRepository['deletePendingDoseLogs']>
  ) {
    return this.doseLogRepository.deletePendingDoseLogs(...args);
  }

  markDoseStatus(...args: Parameters<DoseLogRepository['markDoseStatus']>) {
    return this.doseLogRepository.markDoseStatus(...args);
  }

  resolveDismissibleDoseLog(
    ...args: Parameters<DoseLogRepository['resolveDismissibleDoseLog']>
  ) {
    return this.doseLogRepository.resolveDismissibleDoseLog(...args);
  }

  snoozeDose(...args: Parameters<DoseLogRepository['snoozeDose']>) {
    return this.doseLogRepository.snoozeDose(...args);
  }

  getScheduleTimesForUserMedication(
    ...args: Parameters<
      DoseScheduleRepository['getScheduleTimesForUserMedication']
    >
  ) {
    return this.doseScheduleRepository.getScheduleTimesForUserMedication(
      ...args,
    );
  }

  getAllActiveUserMedicationIds(
    ...args: Parameters<DoseScheduleRepository['getAllActiveUserMedicationIds']>
  ) {
    return this.doseScheduleRepository.getAllActiveUserMedicationIds(...args);
  }

  upsertUserDevice(
    ...args: Parameters<NotificationPreferencesRepository['upsertUserDevice']>
  ) {
    return this.notificationPreferencesRepository.upsertUserDevice(...args);
  }

  upsertFollowUpPreferences(
    ...args: Parameters<
      NotificationPreferencesRepository['upsertFollowUpPreferences']
    >
  ) {
    return this.notificationPreferencesRepository.upsertFollowUpPreferences(
      ...args,
    );
  }

  getFollowUpPreferences(
    ...args: Parameters<
      NotificationPreferencesRepository['getFollowUpPreferences']
    >
  ) {
    return this.notificationPreferencesRepository.getFollowUpPreferences(
      ...args,
    );
  }

  upsertEmergencyContactSmsPreference(
    ...args: Parameters<
      NotificationPreferencesRepository['upsertEmergencyContactSmsPreference']
    >
  ) {
    return this.notificationPreferencesRepository.upsertEmergencyContactSmsPreference(
      ...args,
    );
  }

  getEmergencyContactSmsEnabled(
    ...args: Parameters<
      NotificationPreferencesRepository['getEmergencyContactSmsEnabled']
    >
  ) {
    return this.notificationPreferencesRepository.getEmergencyContactSmsEnabled(
      ...args,
    );
  }

  getEmergencyContactSmsPreference(
    ...args: Parameters<
      NotificationPreferencesRepository['getEmergencyContactSmsPreference']
    >
  ) {
    return this.notificationPreferencesRepository.getEmergencyContactSmsPreference(
      ...args,
    );
  }

  getActiveDeviceTokens(
    ...args: Parameters<
      NotificationPreferencesRepository['getActiveDeviceTokens']
    >
  ) {
    return this.notificationPreferencesRepository.getActiveDeviceTokens(
      ...args,
    );
  }

  deactivateDeviceToken(
    ...args: Parameters<
      NotificationPreferencesRepository['deactivateDeviceToken']
    >
  ) {
    return this.notificationPreferencesRepository.deactivateDeviceToken(
      ...args,
    );
  }

  searchMedications(
    ...args: Parameters<MedicationRepository['searchMedications']>
  ) {
    return this.medicationRepository.searchMedications(...args);
  }

  searchMedicationCatalog(
    ...args: Parameters<MedicationRepository['searchCatalog']>
  ) {
    return this.medicationRepository.searchCatalog(...args);
  }
}
