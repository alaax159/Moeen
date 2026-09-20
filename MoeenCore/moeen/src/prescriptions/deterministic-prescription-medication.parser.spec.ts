import { DeterministicPrescriptionMedicationParser } from './deterministic-prescription-medication.parser';

describe('DeterministicPrescriptionMedicationParser', () => {
  const parser = new DeterministicPrescriptionMedicationParser();

  it('extracts grounded medication fields from one medication', () => {
    expect(
      parser.parse(
        'Amoxicillin 500 mg capsule\nTake 1 capsule three times daily for 7 days',
      ),
    ).toEqual([
      {
        name: 'Amoxicillin',
        dose: 500,
        unit: 'mg',
        dosageForm: 'capsule',
        frequency: '3 times daily',
        duration: '7 days',
        times: [],
        instructions: null,
      },
    ]);
  });

  it('extracts and keeps multiple medications separate', () => {
    expect(
      parser.parse(
        'Amoxicillin 500 mg capsule\nTake 1 capsule three times daily for 7 days\n\nParacetamol 500 mg tablet\nTake 1 tablet when needed',
      ),
    ).toEqual([
      expect.objectContaining({
        name: 'Amoxicillin',
        dosageForm: 'capsule',
        frequency: '3 times daily',
        duration: '7 days',
        instructions: null,
      }),
      expect.objectContaining({
        name: 'Paracetamol',
        dosageForm: 'tablet',
        frequency: 'when needed',
        duration: null,
        instructions: 'when needed',
      }),
    ]);
  });

  it('normalizes only explicitly written medication times', () => {
    expect(
      parser.parse('Metformin 500 mg\nTake daily at 8am and 20:30')[0],
    ).toEqual(
      expect.objectContaining({
        frequency: '1 time daily',
        times: ['08:00', '20:30'],
      }),
    );
  });

  it('does not invent optional fields that are absent', () => {
    expect(parser.parse('Metformin 500 mg')).toEqual([
      {
        name: 'Metformin',
        dose: 500,
        unit: 'mg',
        dosageForm: null,
        frequency: null,
        duration: null,
        times: [],
        instructions: null,
      },
    ]);
  });

  it('returns no medications for unrelated OCR text', () => {
    expect(
      parser.parse(
        'Patient: Test User\nDate: 2026-08-31\nFollow up after one week.',
      ),
    ).toEqual([]);
  });

  it('extracts an explicit evening time without inventing duration', () => {
    expect(
      parser.parse('Atorvastatin 20 mg tablet\nTake 1 tablet daily at 9:00 PM'),
    ).toEqual([
      expect.objectContaining({
        name: 'Atorvastatin',
        dose: 20,
        unit: 'mg',
        dosageForm: 'tablet',
        frequency: '1 time daily',
        duration: null,
        times: ['21:00'],
      }),
    ]);
  });

  it('preserves grounded before-breakfast instructions', () => {
    expect(
      parser.parse(
        'Omeprazole 20 mg capsule\nTake 1 capsule once daily before breakfast',
      ),
    ).toEqual([
      expect.objectContaining({
        name: 'Omeprazole',
        frequency: '1 time daily',
        instructions: 'before breakfast',
        duration: null,
      }),
    ]);
  });

  it('supports a dosage-form-only heading without inventing a strength', () => {
    expect(
      parser.parse('Salbutamol inhaler\nTake 2 puffs when needed'),
    ).toEqual([
      {
        name: 'Salbutamol',
        dose: null,
        unit: null,
        dosageForm: 'inhaler',
        frequency: 'when needed',
        duration: null,
        times: [],
        instructions: 'when needed',
      },
    ]);
  });

  it.each([
    'Apply cream',
    'Use drops',
    'Apply cream twice daily',
    'Use drops as needed',
  ])(
    'does not treat an instruction line as a form-only medication heading: %s',
    (text) => {
      expect(parser.parse(text)).toEqual([]);
    },
  );

  it('does not simplify a liquid concentration into an incorrect dose', () => {
    expect(
      parser.parse(
        'Amoxicillin suspension 250 mg/5 mL\nTake 5 mL three times daily for 5 days',
      ),
    ).toEqual([
      {
        name: 'Amoxicillin',
        dose: null,
        unit: null,
        dosageForm: 'suspension',
        frequency: '3 times daily',
        duration: '5 days',
        times: [],
        instructions: null,
        requiresReview: true,
      },
    ]);
  });

  it('does not silently correct malformed OCR spelling or strength', () => {
    expect(
      parser.parse('Amoxicillin 5OO mg capsue\nTake 1 capsul 3 times daliy'),
    ).toEqual([]);
  });

  it('separates three medications without cross-medication leakage', () => {
    const result = parser.parse(
      'Amoxicillin 500 mg capsule\nTake 1 capsule three times daily for 7 days\n\nParacetamol 500 mg tablet\nTake 1 tablet when needed\n\nOmeprazole 20 mg capsule\nTake 1 capsule once daily before breakfast',
    );

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual(
      expect.objectContaining({ duration: '7 days', instructions: null }),
    );
    expect(result[1]).toEqual(
      expect.objectContaining({ duration: null, instructions: 'when needed' }),
    );
    expect(result[2]).toEqual(
      expect.objectContaining({
        duration: null,
        instructions: 'before breakfast',
      }),
    );
  });

  it('extracts explicit morning and evening times only', () => {
    expect(
      parser.parse(
        'Metformin 500 mg tablet\nTake 1 tablet at 8:00 AM and 8:00 PM',
      )[0],
    ).toEqual(
      expect.objectContaining({ times: ['08:00', '20:00'], duration: null }),
    );
  });

  it('extracts duration and frequency without inventing dosage form', () => {
    expect(
      parser.parse('Doxycycline 100 mg\nTake twice daily for 10 days')[0],
    ).toEqual(
      expect.objectContaining({
        name: 'Doxycycline',
        dose: 100,
        unit: 'mg',
        dosageForm: null,
        frequency: '2 times daily',
        duration: '10 days',
      }),
    );
  });

  it('preserves every-eight-hours and as-needed-for-pain semantics', () => {
    expect(
      parser.parse(
        'Ibuprofen 400 mg tablet\nTake 1 tablet every 8 hours as needed for pain',
      )[0],
    ).toEqual(
      expect.objectContaining({
        frequency: 'every 8 hours',
        instructions: 'as needed for pain',
        duration: null,
      }),
    );
  });

  it('does not fabricate a name from unstructured medication fragments', () => {
    expect(parser.parse('500 mg\nthree times\ntablet\n7 days')).toEqual([]);
  });

  it('does not invent fields for a strength-only medication heading', () => {
    expect(parser.parse('Azithromycin 250 mg tablet')[0]).toEqual(
      expect.objectContaining({
        frequency: null,
        duration: null,
        instructions: null,
        times: [],
      }),
    );
  });
});
