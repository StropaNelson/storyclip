import { dbPut, dbGetAll, dbGet, dbDelete, dbAdd } from './db.js';

export class ProjectManager {
  constructor() {
    this.currentProject = null;
    this.onChange = null;
  }

  async createNew(name = 'Novo Projeto') {
    this.currentProject = {
      id: crypto.randomUUID(),
      name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sourceMedia: null,
      episodeDuration: 60,
      summaryStrategy: 'none',
      summaryDuration: 10,
      episodes: [],
      introOutroLibrary: [],
      format: {},
      covers: [],
      manualSummaries: [],
    };
    if (this.onChange) this.onChange(this.currentProject);
    return this.currentProject;
  }

  async save() {
    if (!this.currentProject) return null;
    this.currentProject.updatedAt = Date.now();
    await dbPut('projects', this.currentProject);
    return this.currentProject;
  }

  async saveAs(name) {
    if (!this.currentProject) return null;
    const clone = { ...this.currentProject, id: crypto.randomUUID(), name, createdAt: Date.now(), updatedAt: Date.now() };
    await dbAdd('projects', clone);
    return clone;
  }

  async load(id) {
    const proj = await dbGet('projects', id);
    if (!proj) return null;
    this.currentProject = proj;
    if (this.onChange) this.onChange(this.currentProject);
    return proj;
  }

  async list() {
    return await dbGetAll('projects');
  }

  async duplicate(id) {
    const proj = await dbGet('projects', id);
    if (!proj) return null;
    const clone = { ...proj, id: crypto.randomUUID(), name: `${proj.name} (Cópia)`, createdAt: Date.now(), updatedAt: Date.now() };
    await dbAdd('projects', clone);
    return clone;
  }

  async delete(id) {
    await dbDelete('projects', id);
    if (this.currentProject && this.currentProject.id === id) this.currentProject = null;
  }

  async exportFile() {
    if (!this.currentProject) return null;
    const data = JSON.stringify(this.currentProject, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    return { url, blob, name: `${this.currentProject.name}.clipstudio` };
  }

  async importFile(file) {
    const text = await file.text();
    const proj = JSON.parse(text);
    proj.id = crypto.randomUUID();
    proj.createdAt = Date.now();
    proj.updatedAt = Date.now();
    await dbAdd('projects', proj);
    this.currentProject = proj;
    if (this.onChange) this.onChange(this.currentProject);
    return proj;
  }

  getCurrent() {
    return this.currentProject;
  }
}

export const projectManager = new ProjectManager();
