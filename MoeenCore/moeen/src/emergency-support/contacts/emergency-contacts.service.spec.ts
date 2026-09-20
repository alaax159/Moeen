import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { EmergencyContactsService } from './emergency-contacts.service';

describe('EmergencyContactsService', () => {
  const repo = {
    listByUserId: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    setPrimary: jest.fn(),
  };
  const service = new EmergencyContactsService(repo as never);

  beforeEach(() => jest.resetAllMocks());

  it('list delegates to the repo with the user id', async () => {
    repo.listByUserId.mockResolvedValue([{ id: 1 }]);
    await expect(service.list(42)).resolves.toEqual([{ id: 1 }]);
    expect(repo.listByUserId).toHaveBeenCalledWith(42);
  });

  it('create passes the fields through with the user id', async () => {
    repo.create.mockResolvedValue({ id: 1, isPrimary: true });
    await service.create(42, {
      name: 'Mum',
      phone: '+970599123456',
      relationship: 'mother',
    });
    expect(repo.create).toHaveBeenCalledWith(42, {
      name: 'Mum',
      phone: '+970599123456',
      relationship: 'mother',
    });
  });

  it('update rejects an empty patch without hitting the repo', async () => {
    await expect(service.update(42, 1, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('update throws NotFound when the repo returns nothing', async () => {
    repo.update.mockResolvedValue(undefined);
    await expect(service.update(42, 1, { name: 'New' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('delete throws NotFound for outcome not_found', async () => {
    repo.delete.mockResolvedValue({ outcome: 'not_found' });
    await expect(service.delete(42, 1)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('delete throws Conflict (409) for the last contact', async () => {
    repo.delete.mockResolvedValue({ outcome: 'last' });
    await expect(service.delete(42, 1)).rejects.toBeInstanceOf(ConflictException);
  });

  it('delete resolves when a contact is deleted', async () => {
    repo.delete.mockResolvedValue({ outcome: 'deleted' });
    await expect(service.delete(42, 1)).resolves.toBeUndefined();
  });

  it('setPrimary throws NotFound when the repo returns nothing', async () => {
    repo.setPrimary.mockResolvedValue(undefined);
    await expect(service.setPrimary(42, 1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('setPrimary returns the updated row', async () => {
    repo.setPrimary.mockResolvedValue({ id: 1, isPrimary: true });
    await expect(service.setPrimary(42, 1)).resolves.toEqual({
      id: 1,
      isPrimary: true,
    });
    expect(repo.setPrimary).toHaveBeenCalledWith(42, 1);
  });
});
