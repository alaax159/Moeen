import { GUARDS_METADATA } from '@nestjs/common/constants';

import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { PostChatMessageController } from '../guidance/endpoints/post-chat-message/post-chat-message.controller';
import { MedicalTerminologyController } from '../health-profile/medical-terminology/medical-terminology.controller';
import { ActiveInteractionsController } from '../medication-safety/active-interactions.controller';
import { MedicationsController } from '../medications/search-medication/search-medication.controller';
import { PrescriptionController } from '../prescriptions/prescription.controller';
import { UserSyncGuard } from '../users/user-sync.guard';

describe('authenticated upstream proxy surfaces', () => {
  it.each([
    MedicalTerminologyController,
    MedicationsController,
    PostChatMessageController,
    PrescriptionController,
    ActiveInteractionsController,
  ])(
    'protects %p with authentication and synchronized local identity',
    (controller) => {
      expect(Reflect.getMetadata(GUARDS_METADATA, controller)).toEqual([
        FirebaseAuthGuard,
        UserSyncGuard,
      ]);
    },
  );
});
