import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  applicationDefault,
  getApp,
  initializeApp,
  type App,
} from 'firebase-admin/app';
import { getAuth, type Auth, type DecodedIdToken } from 'firebase-admin/auth';

@Injectable()
export class FirebaseAdminService {
  private readonly auth: Auth;

  constructor(private readonly configService: ConfigService) {
    let app: App;

    try {
      app = getApp();
    } catch {
      const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');

      app = initializeApp({
        credential: applicationDefault(),
        ...(projectId ? { projectId } : {}),
      });
    }

    this.auth = getAuth(app);
  }

  async verifyIdToken(idToken: string): Promise<DecodedIdToken> {
    return this.auth.verifyIdToken(idToken);
  }
}
