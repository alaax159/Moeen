import { EmergencyMedicalCardService } from './emergency-medical-card.service';

describe('EmergencyMedicalCardService', () => {
  const healthProfileRepository = {
    getEmergencyCardProfileByUserId: jest.fn(),
    getEmergencyCardActiveAllergiesByUserId: jest.fn(),
    getActiveChronicConditionsByUserId: jest.fn(),
  };
  const userMedicationRepository = {
    getCurrentMedicationsByUserId: jest.fn(),
    getLatestMedicationUpdatedAtByUserId: jest.fn(),
  };
  const service = new EmergencyMedicalCardService(
    healthProfileRepository as never,
    userMedicationRepository as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    healthProfileRepository.getEmergencyCardProfileByUserId.mockResolvedValue(
      undefined,
    );
    healthProfileRepository.getEmergencyCardActiveAllergiesByUserId.mockResolvedValue(
      [],
    );
    healthProfileRepository.getActiveChronicConditionsByUserId.mockResolvedValue(
      [],
    );
    userMedicationRepository.getCurrentMedicationsByUserId.mockResolvedValue(
      [],
    );
    userMedicationRepository.getLatestMedicationUpdatedAtByUserId.mockResolvedValue(
      null,
    );
  });

  it('aggregates a complete medical card without exposing internal fields', async () => {
    healthProfileRepository.getEmergencyCardProfileByUserId.mockResolvedValue({
      firstName: 'Maya',
      lastName: 'Haddad',
      dateOfBirth: '1985-04-03',
      gender: 'female',
      bloodType: 'O+',
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    });
    healthProfileRepository.getEmergencyCardActiveAllergiesByUserId.mockResolvedValue(
      [
        {
          id: 7,
          name: 'Penicillin',
          reaction: 'Rash',
          severity: 'moderate',
          updatedAt: new Date('2026-01-03T00:00:00.000Z'),
        },
      ],
    );
    healthProfileRepository.getActiveChronicConditionsByUserId.mockResolvedValue(
      [
        {
          id: 8,
          name: 'Asthma',
          updatedAt: new Date('2026-01-04T00:00:00.000Z'),
        },
      ],
    );
    userMedicationRepository.getCurrentMedicationsByUserId.mockResolvedValue([
      {
        id: 9,
        brandName: 'Ventolin',
        genericName: 'albuterol',
        dosageAmount: '2.00',
        dosageUnit: 'puff',
        dosageForm: 'inhaler',
        frequency: 2,
        instructions: 'Use as directed',
        scheduleTimes: ['08:00:00', '20:00:00'],
        updatedAt: new Date('2026-01-05T00:00:00.000Z'),
        scheduleUpdatedAt: new Date('2026-01-06T00:00:00.000Z'),
      },
    ]);

    await expect(service.getEmergencyMedicalCard(42)).resolves.toEqual({
      patient: {
        firstName: 'Maya',
        lastName: 'Haddad',
        dateOfBirth: '1985-04-03',
        gender: 'female',
        bloodType: 'O+',
      },
      allergies: [
        { name: 'Penicillin', reaction: 'Rash', severity: 'moderate' },
      ],
      chronicConditions: [{ name: 'Asthma' }],
      medications: [
        {
          name: 'Ventolin',
          normalizedName: 'albuterol',
          dose: 2,
          unit: 'puff',
          dosageForm: 'inhaler',
          frequency: 2,
          instructions: 'Use as directed',
          times: ['08:00:00', '20:00:00'],
        },
      ],
      emergencyContacts: [],
      lastUpdated: '2026-01-06T00:00:00.000Z',
    });
  });

  it('handles a missing optional profile and empty medical sections', async () => {
    healthProfileRepository.getEmergencyCardProfileByUserId.mockResolvedValue({
      firstName: 'Maya',
      lastName: null,
      dateOfBirth: null,
      gender: null,
      bloodType: null,
      updatedAt: null,
    });

    await expect(service.getEmergencyMedicalCard(42)).resolves.toEqual({
      patient: {
        firstName: 'Maya',
        lastName: null,
        dateOfBirth: null,
        gender: null,
        bloodType: null,
      },
      allergies: [],
      chronicConditions: [],
      medications: [],
      emergencyContacts: [],
      lastUpdated: null,
    });
  });

  it('uses the newest relevant record for lastUpdated', async () => {
    healthProfileRepository.getEmergencyCardActiveAllergiesByUserId.mockResolvedValue(
      [
        {
          name: 'Latex',
          reaction: null,
          severity: null,
          updatedAt: new Date('2026-08-31T12:00:00.000Z'),
        },
      ],
    );
    healthProfileRepository.getActiveChronicConditionsByUserId.mockResolvedValue(
      [
        {
          name: 'Diabetes',
          updatedAt: new Date('2026-08-30T12:00:00.000Z'),
        },
      ],
    );

    const card = await service.getEmergencyMedicalCard(42);

    expect(card.lastUpdated).toBe('2026-08-31T12:00:00.000Z');
  });

  it('does not use an unrelated application-user updatedAt', async () => {
    healthProfileRepository.getEmergencyCardProfileByUserId.mockResolvedValue({
      firstName: 'Maya',
      lastName: 'Haddad',
      dateOfBirth: null,
      gender: null,
      bloodType: null,
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      userUpdatedAt: new Date('2026-12-31T00:00:00.000Z'),
    });

    const card = await service.getEmergencyMedicalCard(42);

    expect(card.lastUpdated).toBe('2026-01-01T00:00:00.000Z');
  });

  it('uses a medication edit as the newest lastUpdated value', async () => {
    healthProfileRepository.getEmergencyCardProfileByUserId.mockResolvedValue({
      firstName: 'Maya',
      lastName: 'Haddad',
      dateOfBirth: null,
      gender: null,
      bloodType: null,
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    userMedicationRepository.getCurrentMedicationsByUserId.mockResolvedValue([
      {
        brandName: 'Ventolin',
        genericName: 'albuterol',
        dosageAmount: '2.00',
        dosageUnit: 'puff',
        dosageForm: 'inhaler',
        frequency: 2,
        instructions: null,
        scheduleTimes: [],
        updatedAt: new Date('2026-02-01T00:00:00.000Z'),
        scheduleUpdatedAt: null,
      },
    ]);
    userMedicationRepository.getLatestMedicationUpdatedAtByUserId.mockResolvedValue(
      new Date('2026-02-01T00:00:00.000Z'),
    );

    const card = await service.getEmergencyMedicalCard(42);

    expect(card.lastUpdated).toBe('2026-02-01T00:00:00.000Z');
  });

  it('uses the latest medication mutation when a medication leaves the current card', async () => {
    userMedicationRepository.getLatestMedicationUpdatedAtByUserId.mockResolvedValue(
      new Date('2026-03-01T00:00:00.000Z'),
    );

    const card = await service.getEmergencyMedicalCard(42);

    expect(card.medications).toEqual([]);
    expect(card.lastUpdated).toBe('2026-03-01T00:00:00.000Z');
  });

  it('requests every section for only the authenticated identity', async () => {
    await service.getEmergencyMedicalCard(42);

    expect(
      healthProfileRepository.getEmergencyCardProfileByUserId,
    ).toHaveBeenCalledWith(42);
    expect(
      healthProfileRepository.getEmergencyCardActiveAllergiesByUserId,
    ).toHaveBeenCalledWith(42);
    expect(
      healthProfileRepository.getActiveChronicConditionsByUserId,
    ).toHaveBeenCalledWith(42);
    expect(
      userMedicationRepository.getCurrentMedicationsByUserId,
    ).toHaveBeenCalledWith(42);
    expect(
      userMedicationRepository.getLatestMedicationUpdatedAtByUserId,
    ).toHaveBeenCalledWith(42);
  });
});
