// Merges duplicate layouts in an existing database (imports do this on their
// own; this catches up data imported before the merge rules changed).
//   pnpm merge:layouts
// Uses DATABASE_PATH if set, otherwise data/hcdgc.db.
import { db, transaction } from "../lib/db";
import { mergeDuplicateLayouts } from "../lib/layouts";

const count = () => (db.prepare("SELECT COUNT(*) AS n FROM layouts").get() as { n: number }).n;
const before = count();
transaction(() => mergeDuplicateLayouts());
console.log(`Layouts: ${before} → ${count()}`);
