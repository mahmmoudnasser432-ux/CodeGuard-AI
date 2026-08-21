export interface Project {
  id: string;
  ownerUserId: string;
  name: string;
  description?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}
