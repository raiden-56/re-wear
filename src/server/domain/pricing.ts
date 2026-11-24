export type RuleCandidate = {
  id: string;
  categoryId: string;
  channel: string;
  condition: string;
  serviceAreaId: string | null;
  city: string | null;
  pricePerKgPaise: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  active: boolean;
  approvalStatus: string;
};

export type PricingContext = {
  categoryId: string;
  channel: string;
  condition?: string;
  serviceAreaId?: string | null;
  city?: string | null;
  at: Date;
};

/** Is a rule live (active, approved, inside its effective window) at a given instant? */
export function isRuleLive(rule: RuleCandidate, at: Date) {
  return (
    rule.active &&
    rule.approvalStatus === "APPROVED" &&
    rule.effectiveFrom.getTime() <= at.getTime() &&
    (rule.effectiveTo === null || rule.effectiveTo.getTime() > at.getTime())
  );
}

/**
 * Specificity: service-area rule > city rule > global rule; exact condition > ANY.
 * Ties are broken by the most recent effectiveFrom.
 */
function specificity(rule: RuleCandidate, ctx: PricingContext) {
  let s = 0;
  if (rule.serviceAreaId) s += 100;
  else if (rule.city) s += 10;
  if (ctx.condition && rule.condition === ctx.condition) s += 1;
  return s;
}

export function selectRule(rules: RuleCandidate[], ctx: PricingContext): RuleCandidate | null {
  const matches = rules.filter((r) => {
    if (r.categoryId !== ctx.categoryId || r.channel !== ctx.channel) return false;
    if (!isRuleLive(r, ctx.at)) return false;
    if (r.serviceAreaId && r.serviceAreaId !== ctx.serviceAreaId) return false;
    if (!r.serviceAreaId && r.city && r.city.toLowerCase() !== (ctx.city ?? "").toLowerCase()) return false;
    if (r.condition !== "ANY" && r.condition !== (ctx.condition ?? "ANY")) return false;
    return true;
  });
  matches.sort((a, b) => specificity(b, ctx) - specificity(a, ctx) || b.effectiveFrom.getTime() - a.effectiveFrom.getTime());
  return matches[0] ?? null;
}
