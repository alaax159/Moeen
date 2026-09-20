import { severityLanguageIsConsistent } from './severity-language-guard';

describe('severityLanguageIsConsistent', () => {
  describe('major and contraindicated findings', () => {
    it.each(['major', 'contraindicated'] as const)(
      'rejects minimizing language for a %s finding',
      (severity) => {
        expect(
          severityLanguageIsConsistent(
            'This is nothing to worry about, it is not serious.',
            severity,
          ),
        ).toBe(false);
      },
    );

    it.each(['major', 'contraindicated'] as const)(
      'accepts language that treats a %s finding as serious',
      (severity) => {
        expect(
          severityLanguageIsConsistent(
            'This combination carries a significant risk and should be reviewed with your doctor soon.',
            severity,
          ),
        ).toBe(true);
      },
    );

    it('catches each minimizing phrase individually', () => {
      const phrases = [
        'nothing to worry about',
        'not serious',
        'no need to worry',
        'not a big deal',
        'minor concern',
        'mild issue',
        'low risk',
        'no cause for concern',
        'not dangerous',
        'harmless',
        'you can ignore',
        'no need to see',
        'not urgent',
        'no immediate concern',
      ];
      for (const phrase of phrases) {
        expect(
          severityLanguageIsConsistent(`The finding is ${phrase}.`, 'major'),
        ).toBe(false);
      }
    });

    it('is case-insensitive', () => {
      expect(
        severityLanguageIsConsistent('NOTHING TO WORRY ABOUT.', 'major'),
      ).toBe(false);
    });
  });

  describe('minor findings', () => {
    it('rejects emergency-escalating language for a minor finding', () => {
      expect(
        severityLanguageIsConsistent(
          'This is a life-threatening emergency, call 911 now.',
          'minor',
        ),
      ).toBe(false);
    });

    it('accepts calm language for a minor finding', () => {
      expect(
        severityLanguageIsConsistent(
          'This is a minor interaction worth mentioning to your pharmacist at your next visit.',
          'minor',
        ),
      ).toBe(true);
    });
  });

  describe('moderate findings', () => {
    it('has no directional check — both calm and serious phrasing pass', () => {
      expect(
        severityLanguageIsConsistent(
          'This is a moderate interaction.',
          'moderate',
        ),
      ).toBe(true);
      expect(
        severityLanguageIsConsistent(
          'This interaction is significant and worth discussing soon.',
          'moderate',
        ),
      ).toBe(true);
    });
  });
});
