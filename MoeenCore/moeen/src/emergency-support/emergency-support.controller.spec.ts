jest.mock('../auth/firebase-auth.guard', () => ({
  FirebaseAuthGuard: class FirebaseAuthGuard {},
}));
jest.mock('../users/user-sync.guard', () => ({
  UserSyncGuard: class UserSyncGuard {},
}));

import { EmergencySupportController } from './emergency-support.controller';

describe('EmergencySupportController', () => {
  it('gets the card using only the authenticated application user ID', async () => {
    const card = { patient: {}, lastUpdated: null };
    const service = {
      getEmergencyMedicalCard: jest.fn().mockResolvedValue(card),
    };
    const controller = new EmergencySupportController(
      service as never,
      {} as never,
    );

    await expect(controller.getEmergencyMedicalCard({ id: 42 })).resolves.toBe(
      card,
    );
    expect(service.getEmergencyMedicalCard).toHaveBeenCalledWith(42);
  });

  it('passes only CurrentUser.id and expectedVersion to access mutations', async () => {
    const accessService = {
      getStatus: jest.fn(),
      enable: jest.fn(),
      regenerate: jest.fn(),
      disable: jest.fn(),
    };
    const controller = new EmergencySupportController(
      {} as never,
      accessService as never,
    );

    await controller.getEmergencyAccessStatus({ id: 17 });
    await controller.enableEmergencyAccess({ id: 17 }, { expectedVersion: 2 });
    await controller.regenerateEmergencyAccess(
      { id: 17 },
      { expectedVersion: 2 },
    );
    await controller.disableEmergencyAccess({ id: 17 }, { expectedVersion: 2 });

    expect(accessService.getStatus).toHaveBeenCalledWith(17);
    expect(accessService.enable).toHaveBeenCalledWith(17, 2);
    expect(accessService.regenerate).toHaveBeenCalledWith(17, 2);
    expect(accessService.disable).toHaveBeenCalledWith(17, 2);
  });
});
