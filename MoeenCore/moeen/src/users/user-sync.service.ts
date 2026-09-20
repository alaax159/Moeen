import { Injectable } from '@nestjs/common';

import { UserRepository } from '../database/repository/user.repository';

import type { FirebaseUserIdentity } from '../auth/current-firebase-uid.decorator';

@Injectable()
export class UserSyncService {
  constructor(
    private readonly userRepository: UserRepository,
  ) {}

  async getOrCreateUser(
    firebaseUser: FirebaseUserIdentity,
  ) {
    return this.userRepository.getOrCreateUser(
      firebaseUser.uid,
      firebaseUser.email,
    );
  }
}