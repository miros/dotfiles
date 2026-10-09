import { addOnApplies, cacheWriteExtraMicros, priceKey, } from "./pricing";
/** Binary name order, matching the SQL `ORDER BY ... ASC` this replaces. */
function compareNames(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
}
function sorted(totals, make, nameOf) {
    return [...totals]
        .map(([name, micros]) => make(name, micros))
        .sort((a, b) => b.micros - a.micros || compareNames(nameOf(a), nameOf(b)));
}
/**
 * Combines opencode's own cost sums with a cache-write add-on computed per row from the current
 * catalog: one rounding per row, added as integers to the total, the agent and the model. Pure.
 */
export function buildSummary(aggregate, candidates, catalog) {
    const agents = new Map(aggregate.agents.map((a) => [a.agent, a.micros]));
    const models = new Map(aggregate.models.map((m) => [m.model, m.micros]));
    const providers = new Map(aggregate.providers.map((p) => [p.provider, p.micros]));
    const unpriced = new Set();
    let complete = true;
    for (const row of candidates) {
        const key = priceKey(row.providerId, row.modelId);
        const price = catalog.get(key);
        if (!addOnApplies(row.providerId, row.modelId, price))
            continue;
        if (row.tokens === null) {
            complete = false;
            continue;
        }
        if (!price || price.cost.length === 0) {
            complete = false;
            unpriced.add(key);
            continue;
        }
        const extra = cacheWriteExtraMicros(row.tokens, price);
        if (extra === 0)
            continue;
        agents.set(row.agent, (agents.get(row.agent) ?? 0) + extra);
        models.set(row.modelId, (models.get(row.modelId) ?? 0) + extra);
        providers.set(row.providerId, (providers.get(row.providerId) ?? 0) + extra);
    }
    const agentList = sorted(agents, (agent, micros) => ({ agent, micros }), (e) => e.agent);
    return {
        totalMicros: agentList.reduce((sum, entry) => sum + entry.micros, 0),
        agents: agentList,
        models: sorted(models, (model, micros) => ({ model, micros }), (e) => e.model),
        providers: sorted(providers, (provider, micros) => ({ provider, micros }), (e) => e.provider),
        complete,
        unpriced: [...unpriced].sort(),
    };
}
//# sourceMappingURL=summary.js.map