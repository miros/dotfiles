import { CURRENT_SCHEMA_VERSION } from "./store";
const ZERO_COUNTS = {
    pending: 0,
    in_progress: 0,
    completed: 0,
    cancelled: 0,
};
/** Shared metadata contract for both `todowrite` and `todoread` results (design D8). */
export function buildMetadata(sessionID, revision, todos) {
    const counts = { ...ZERO_COUNTS };
    for (const todo of todos)
        counts[todo.status] += 1;
    return {
        source: "opencode-todo",
        schemaVersion: CURRENT_SCHEMA_VERSION,
        sessionID,
        revision,
        todos,
        counts,
    };
}
//# sourceMappingURL=metadata.js.map