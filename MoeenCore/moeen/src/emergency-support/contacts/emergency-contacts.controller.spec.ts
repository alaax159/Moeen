jest.mock('../../auth/firebase-auth.guard', () => ({
  FirebaseAuthGuard: class FirebaseAuthGuard {},
}));
jest.mock('../../users/user-sync.guard', () => ({
  UserSyncGuard: class UserSyncGuard {},
}));

import { EmergencyContactsController } from './emergency-contacts.controller';

describe('EmergencyContactsController', () => {
  const service = {
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    setPrimary: jest.fn(),
  };
  const controller = new EmergencyContactsController(service as never);
  const user = { id: 42 };

  beforeEach(() => jest.resetAllMocks());

  it('list delegates with the authenticated user id', async () => {
    service.list.mockResolvedValue([]);
    await controller.list(user);
    expect(service.list).toHaveBeenCalledWith(42);
  });

  it('create delegates with the user id and body', async () => {
    const dto = { name: 'Mum', phone: '+970599123456' };
    await controller.create(user, dto as never);
    expect(service.create).toHaveBeenCalledWith(42, dto);
  });

  it('update delegates with the user id, param id, and body', async () => {
    const dto = { name: 'New' };
    await controller.update(user, 7, dto as never);
    expect(service.update).toHaveBeenCalledWith(42, 7, dto);
  });

  it('delete delegates with the user id and param id', async () => {
    await controller.delete(user, 7);
    expect(service.delete).toHaveBeenCalledWith(42, 7);
  });

  it('setPrimary delegates with the user id and param id', async () => {
    await controller.setPrimary(user, 7);
    expect(service.setPrimary).toHaveBeenCalledWith(42, 7);
  });
});
