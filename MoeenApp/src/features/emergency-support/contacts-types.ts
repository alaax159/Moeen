// The CRUD contact model behind /api/emergency-support/contacts. Kept separate
// from the `EmergencyContact` interface in ./types.ts, which is the read-only
// shape embedded in the Emergency Medical Card (/card) and only carries
// name + phone.

export interface EmergencyContactRecord {
  id: number;
  name: string;
  phone: string;
  relationship: string | null;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EmergencyContactInput {
  name: string;
  phone: string;
  relationship?: string;
}

export type EmergencyContactUpdate = Partial<EmergencyContactInput>;
