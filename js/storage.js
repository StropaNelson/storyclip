export class StorageManager {
  constructor() {
    this.opfsRoot = null;
    this.opfsAvailable = false;
  }

  async init() {
    try {
      if (typeof navigator.storage !== 'undefined' && navigator.storage.persist) {
        await navigator.storage.persist();
      }
      const opfs = await this._getOPFS();
      if (opfs) {
        this.opfsRoot = opfs;
        this.opfsAvailable = true;
      }
    } catch (e) {
      console.warn('OPFS not available, falling back to IndexedDB/File API', e);
    }
  }

  async _getOPFS() {
    if (!navigator.storage || !navigator.storage.getDirectory) return null;
    const root = await navigator.storage.getDirectory();
    return root;
  }

  async saveFile(name, blob) {
    if (this.opfsAvailable && this.opfsRoot) {
      try {
        const handle = await this.opfsRoot.getFileHandle(name, { create: true });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return { source: 'opfs', name, handle, size: blob.size };
      } catch (e) {
        console.warn('OPFS write failed', e);
      }
    }
    // Fallback: store in IndexedDB
    return { source: 'memory', name, blob, size: blob.size };
  }

  async readFile(name) {
    if (this.opfsAvailable && this.opfsRoot) {
      try {
        const handle = await this.opfsRoot.getFileHandle(name);
        const file = await handle.getFile();
        return file;
      } catch (e) {
        console.warn('OPFS read failed', e);
      }
    }
    return null;
  }

  async deleteFile(name) {
    if (this.opfsAvailable && this.opfsRoot) {
      try {
        await this.opfsRoot.removeEntry(name);
        return true;
      } catch (e) {
        console.warn('OPFS delete failed', e);
      }
    }
    return false;
  }

  async createMediaURL(file) {
    return URL.createObjectURL(file);
  }

  revokeMediaURL(url) {
    URL.revokeObjectURL(url);
  }

  async estimateQuota() {
    if (navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      return { quota: est.quota, usage: est.usage };
    }
    return { quota: null, usage: null };
  }
}

export const storage = new StorageManager();
