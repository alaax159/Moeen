import { ChatIntentClassifier } from './chat-intent-classifier.service';

describe('ChatIntentClassifier', () => {
  const classifier = new ChatIntentClassifier();

  it.each([
    'Do I have diabetes?',
    'Could I have an infection?',
    'What disease do I have?',
    "What's wrong with me?",
    'What is my diagnosis?',
    'Diagnose me from these symptoms.',
    'Do I have kidney disease?',
    'Do I have high blood pressure?',
  ])('refuses diagnostic request: %s', (message) => {
    expect(classifier.classify(message)).toEqual({
      kind: 'refusal',
      reason: 'diagnosis',
    });
  });

  it.each(['هل عندي مرض؟', 'هل أنا مصاب بالسكري؟', 'شو عندي؟', 'ما تشخيصي؟'])(
    'refuses Arabic diagnostic request: %s',
    (message) => {
      expect(classifier.classify(message)).toEqual({
        kind: 'refusal',
        reason: 'diagnosis',
      });
    },
  );

  it.each([
    'Should I increase my dose?',
    'Can I stop taking this medicine?',
    'Should I take two tablets?',
    'How much should I take?',
    'Can I double the dose?',
    'What should my dosage be?',
    'What dose should I take?',
  ])('refuses dose-change request: %s', (message) => {
    expect(classifier.classify(message)).toEqual({
      kind: 'refusal',
      reason: 'dose_change',
    });
  });

  it.each(['هل أزيد الجرعة؟', 'هل أوقف الدواء؟', 'كم حبة آخذ؟', 'آخذ جرعتين؟'])(
    'refuses Arabic dose-change request: %s',
    (message) => {
      expect(classifier.classify(message)).toEqual({
        kind: 'refusal',
        reason: 'dose_change',
      });
    },
  );

  it.each([
    'Can I change my pharmacy?',
    'Can I skip my appointment?',
    'May I have a copy of my prescription?',
    'My dose is fine. Can I change my pharmacy?',
    'عندي مشكلة في تناول الدواء بعد الأكل',
  ])('does not over-match unrelated request: %s', (message) => {
    expect(classifier.classify(message)).toEqual({
      kind: 'guidance',
      intent: 'medication_question',
    });
  });

  it('gives dose-change refusal precedence over missed-dose routing', () => {
    expect(
      classifier.classify('I missed my dose. Should I double the next one?'),
    ).toEqual({
      kind: 'refusal',
      reason: 'dose_change',
    });
  });

  it.each([
    'I missed my dose this morning.',
    'I forgot my medication.',
    'My dose was missed.',
    'نسيت جرعتي اليوم',
    'فاتتني الجرعة',
  ])('routes missed-dose request: %s', (message) => {
    expect(classifier.classify(message)).toEqual({
      kind: 'guidance',
      intent: 'missed_dose',
    });
  });

  it.each([
    'What is lisinopril used for?',
    'Can I take this with food?',
    'What does the label say about dosage?',
    'What happens if I stop taking it?',
    'What side effects should I know about?',
  ])(
    'keeps an informational question in medication_question: %s',
    (message) => {
      expect(classifier.classify(message)).toEqual({
        kind: 'guidance',
        intent: 'medication_question',
      });
    },
  );
});
