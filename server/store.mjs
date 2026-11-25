import { open, schema } from './store/schema.mjs';
import { profiles, roles } from './store/profiles.mjs';
import { trees } from './store/trees.mjs';
import { knowledge } from './store/knowledge.mjs';
import { media } from './store/media.mjs';
import { usage } from './store/usage.mjs';
import { resources } from './store/resources.mjs';
import { pieces } from './store/pieces.mjs';
import { discussions } from './store/discussions.mjs';
import { recovery } from './store/recovery.mjs';
import { search } from './store/search.mjs';

// Each record family's methods live in server/store/ and are installed on the Store prototype.
export class Store {
    constructor(path) {
        open.call(this, path);
    }
    static roles = roles;
    // Runs write under the write lock and returns its result; a throw rolls every write back.
    transaction(write) {
        this.db.exec('BEGIN IMMEDIATE');
        try {
            const result = write();
            this.db.exec('COMMIT');
            return result;
        } catch (error) {
            this.db.exec('ROLLBACK');
            throw error;
        }
    }
    close() {
        if (this.db.isOpen) this.db.close(); // tests' t.after cleanup may follow an inline restart close
    }
}
Object.assign(
    Store.prototype,
    schema,
    profiles,
    trees,
    knowledge,
    media,
    usage,
    resources,
    pieces,
    discussions,
    recovery,
    search,
);
