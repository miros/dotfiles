import { usdToMicros } from "./money";
import { tokenCounts } from "./pricing";
import { COMPACTION_AGENT, UNKNOWN } from "./types";
function str(value) {
    return typeof value === "string" && value !== "" ? value : undefined;
}
function num(value) {
    return typeof value === "number" && Number.isFinite(value)
        ? value
        : undefined;
}
function modelRef(value) {
    if (typeof value !== "object" || value === null)
        return undefined;
    const { providerID, id } = value;
    const providerId = str(providerID);
    const modelId = str(id);
    return providerId && modelId ? { providerId, modelId } : undefined;
}
/** Mirrors opencode's `SessionMessage.ID.fromEvent`. */
function messageIdFromEvent(eventId) {
    return eventId.replace(/^evt_/, "msg_");
}
export function createRecorder(deps) {
    const steps = new Map();
    const lastStep = new Map();
    const compactions = new Map();
    const parents = new Map();
    async function parentOf(sessionID) {
        if (parents.has(sessionID))
            return parents.get(sessionID) ?? null;
        try {
            const parent = await deps.resolveParent(sessionID);
            parents.set(sessionID, parent);
            return parent;
        }
        catch {
            return null;
        }
    }
    async function stepRow(data, failed) {
        const sessionId = str(data.sessionID);
        const id = str(data.assistantMessageID);
        const cost = num(data.cost);
        if (!sessionId || !id || cost === undefined)
            return null;
        if (data.tokens === undefined || data.tokens === null)
            return null;
        const own = steps.get(id);
        steps.delete(id);
        const state = own ?? lastStep.get(sessionId);
        return {
            id,
            sessionId,
            parentSessionId: await parentOf(sessionId),
            agent: state?.agent ?? UNKNOWN,
            providerId: state?.providerId ?? UNKNOWN,
            modelId: state?.modelId ?? UNKNOWN,
            kind: "step",
            failed,
            costMicros: usdToMicros(cost),
            tokens: tokenCounts(data.tokens),
            createdAt: own?.started ?? deps.now(),
        };
    }
    async function compactionRow(event, failed) {
        const data = event.data;
        const sessionId = str(data.sessionID);
        const cost = num(data.cost);
        if (!sessionId || cost === undefined)
            return null;
        if (failed && (data.tokens === undefined || data.tokens === null))
            return null;
        const id = str(data.inputID) ??
            compactions.get(sessionId) ??
            messageIdFromEvent(event.id);
        compactions.delete(sessionId);
        const last = lastStep.get(sessionId);
        const model = modelRef(data.model) ?? last;
        return {
            id,
            sessionId,
            parentSessionId: await parentOf(sessionId),
            agent: last?.agent ?? COMPACTION_AGENT,
            providerId: model?.providerId ?? UNKNOWN,
            modelId: model?.modelId ?? UNKNOWN,
            kind: "compaction",
            failed,
            costMicros: usdToMicros(cost),
            // Null means unknown: the startup fill (or a redelivery) resolves it.
            tokens: data.tokens == null ? null : tokenCounts(data.tokens),
            createdAt: deps.now(),
        };
    }
    return {
        async handle(event) {
            const data = event.data;
            switch (event.type) {
                case "session.step.started": {
                    const id = str(data.assistantMessageID);
                    const sessionId = str(data.sessionID);
                    const agent = str(data.agent);
                    const model = modelRef(data.model);
                    if (!id || !sessionId || !agent || !model)
                        return null;
                    const state = {
                        agent,
                        ...model,
                        started: num(data.started) ?? deps.now(),
                    };
                    steps.set(id, state);
                    lastStep.set(sessionId, state);
                    return null;
                }
                case "session.step.ended":
                    return stepRow(data, false);
                case "session.step.failed":
                    return stepRow(data, true);
                case "session.compaction.started": {
                    const sessionId = str(data.sessionID);
                    if (sessionId)
                        compactions.set(sessionId, str(data.inputID) ?? messageIdFromEvent(event.id));
                    return null;
                }
                case "session.compaction.ended":
                    return compactionRow(event, false);
                case "session.compaction.failed":
                    return compactionRow(event, true);
                default:
                    return null;
            }
        },
    };
}
//# sourceMappingURL=recorder.js.map