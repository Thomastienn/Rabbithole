import { open, schema } from './store/schema.mjs';
import { profiles, roles } from './store/profiles.mjs';
import { trees } from './store/trees.mjs';
import { knowledge } from './store/knowledge.mjs';
import { media } from './store/media.mjs';
import { usage } from './store/usage.mjs';
import { resources } from './store/resources.mjs';
import { pieces } from './store/pieces.mjs';

// Each record family's methods live in server/store/ and are installed on the Store prototype.
export class Store {
  constructor(path) {
    open.call(this, path);
  }
  static roles = roles;
  close() {
    this.db.close();
  }
}
Object.assign(Store.prototype, schema, profiles, trees, knowledge, media, usage, resources, pieces);
