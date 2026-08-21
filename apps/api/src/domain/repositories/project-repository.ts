import { Project } from "../entities/project.ts";

export interface ProjectRepository {
  save(project: Project): Promise<Project>;
  findById(id: string): Promise<Project | null>;
  listByOwner(ownerUserId: string): Promise<Project[]>;
}
