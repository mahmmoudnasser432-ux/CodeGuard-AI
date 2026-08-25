import { Project } from "../entities/project.js";

export interface ProjectRepository {
  save(project: Project): Promise<Project>;
  findById(id: string): Promise<Project | null>;
  listByOwner(ownerUserId: string): Promise<Project[]>;
}
