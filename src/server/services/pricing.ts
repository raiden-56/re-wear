import type { ClothingCondition, SellChannel } from "@prisma/client";
import { db, transaction, type DbOrTx } from "../db";
import { audit, type Actor } from "../audit";
import { assertPermission } from "../auth/guard";
import { AppError } from "../domain/errors";
import { selectRule, type RuleCandidate } from "../domain/pricing";
import { estimate } from "../domain/valuation";

export type RateQuoteLine = { categoryId: string; name: string; grams: number; ratePaisePerKg: number; pricingRuleId: string | null };

async function candidateRules(client: DbOrTx, categoryIds: string[], channel: SellChannel, at: Date) {
  return client.pricingRule.findMany({
    where: {
      categoryId: { in: categoryIds },
      channel,
      active: true,
      approvalStatus: "APPROVED",
      effectiveFrom: { lte: at },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }],
    },
  });
}

/** Server-side rate resolution. Never trusts any client-provided price. */
export async function resolveRates(
  args: { categoryIds: string[]; channel: SellChannel; serviceAreaId?: string | null; city?: string | null; condition?: ClothingCondition; at?: Date },
  client: DbOrTx = db,
) {
  const at = args.at ?? new Date();
  const rules = (await candidateRules(client, args.categoryIds, args.channel, at)) as RuleCandidate[];
  const out = new Map<string, RuleCandidate | null>();
  for (const id of args.categoryIds) {
    out.set(id, selectRule(rules, { categoryId: id, channel: args.channel, serviceAreaId: args.serviceAreaId, city: args.city, condition: args.condition, at }));
  }
  return out;
}

/** Price an estimate (pre-pickup). Donations are always zero-value. */
export async function quote(
  args: { channel: SellChannel; serviceAreaId?: string | null; city?: string | null; items: { categoryId: string; grams: number }[] },
  client: DbOrTx = db,
) {
  const categories = await client.clothingCategory.findMany({ where: { id: { in: args.items.map((i) => i.categoryId) }, active: true, accepted: true } });
  if (categories.length !== new Set(args.items.map((i) => i.categoryId)).size) throw new AppError("VALIDATION", "One or more categories are not accepted.");
  const names = new Map(categories.map((c) => [c.id, c.name]));
  let rates = new Map<string, RuleCandidate | null>();
  if (args.channel !== "DONATION") {
    rates = await resolveRates({ categoryIds: args.items.map((i) => i.categoryId), channel: args.channel, serviceAreaId: args.serviceAreaId, city: args.city }, client);
  }
  const lines: RateQuoteLine[] = args.items.map((i) => {
    const rule = rates.get(i.categoryId) ?? null;
    if (args.channel !== "DONATION" && !rule) throw new AppError("VALIDATION", `${names.get(i.categoryId)} is not currently priced in your area.`);
    return { categoryId: i.categoryId, name: names.get(i.categoryId)!, grams: i.grams, ratePaisePerKg: rule?.pricePerKgPaise ?? 0, pricingRuleId: rule?.id ?? null };
  });
  const est = estimate(lines);
  return { lines: est.lines, totalPaise: est.totalPaise, totalGrams: est.totalGrams, pricedAt: new Date().toISOString(), channel: args.channel };
}

/** Public rate card: every active category with its live rate for a channel/area. */
export async function rateCard(channel: SellChannel = "KG_BUYBACK", serviceAreaId?: string | null, city?: string | null) {
  const cats = await db.clothingCategory.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  const rates = await resolveRates({ categoryIds: cats.map((c) => c.id), channel, serviceAreaId, city });
  return cats.map((c) => ({ ...c, ratePaisePerKg: rates.get(c.id)?.pricePerKgPaise ?? null, pricingRuleId: rates.get(c.id)?.id ?? null }));
}

// ───────────── Administration (maker–checker) ─────────────

export async function proposeRule(
  actor: Actor,
  input: {
    categoryId: string;
    channel: SellChannel;
    condition: ClothingCondition;
    serviceAreaId?: string | null;
    city?: string | null;
    pricePerKgPaise: number;
    effectiveFrom: Date;
    effectiveTo?: Date | null;
    notes?: string | null;
  },
) {
  assertPermission(actor, "pricing:manage");
  if (input.pricePerKgPaise < 0 || input.pricePerKgPaise > 100_000) throw new AppError("VALIDATION", "Rate must be between ₹0 and ₹1,000 per kg.");
  if (input.effectiveTo && input.effectiveTo <= input.effectiveFrom) throw new AppError("VALIDATION", "Expiry must be after the effective date.");
  return transaction(async (tx) => {
    const rule = await tx.pricingRule.create({
      data: { ...input, serviceAreaId: input.serviceAreaId || null, city: input.city || null, approvalStatus: "PENDING", requestedById: actor.id, active: true },
    });
    await tx.pricingHistory.create({ data: { pricingRuleId: rule.id, action: "CREATED", newPricePaise: rule.pricePerKgPaise, actorId: actor.id, note: input.notes } });
    await audit(tx, actor, "pricing.propose", "PricingRule", rule.id, { after: rule });
    return rule;
  });
}

export async function decideRule(actor: Actor, ruleId: string, decision: "APPROVE" | "REJECT", note?: string) {
  assertPermission(actor, "pricing:approve");
  return transaction(async (tx) => {
    const rule = await tx.pricingRule.findUnique({ where: { id: ruleId } });
    if (!rule) throw new AppError("NOT_FOUND", "Pricing rule not found.");
    if (rule.approvalStatus !== "PENDING") throw new AppError("INVALID_STATE", "This rule has already been decided.");
    if (rule.requestedById === actor.id && actor.role !== "SUPER_ADMIN") {
      throw new AppError("FORBIDDEN", "A different administrator must approve your own pricing change (maker–checker).");
    }
    if (decision === "REJECT") {
      const r = await tx.pricingRule.update({ where: { id: ruleId }, data: { approvalStatus: "REJECTED", active: false } });
      await tx.pricingHistory.create({ data: { pricingRuleId: ruleId, action: "REJECTED", actorId: actor.id, note } });
      await audit(tx, actor, "pricing.reject", "PricingRule", ruleId, { before: rule, after: r });
      return r;
    }
    // Close the currently-live rule with the identical scope so exactly one rule applies.
    const overlapping = await tx.pricingRule.findMany({
      where: {
        id: { not: ruleId },
        categoryId: rule.categoryId,
        channel: rule.channel,
        condition: rule.condition,
        serviceAreaId: rule.serviceAreaId,
        city: rule.city,
        approvalStatus: "APPROVED",
        active: true,
        effectiveFrom: { lt: rule.effectiveFrom },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: rule.effectiveFrom } }],
      },
    });
    for (const o of overlapping) {
      await tx.pricingRule.update({ where: { id: o.id }, data: { effectiveTo: rule.effectiveFrom } });
      await tx.pricingHistory.create({ data: { pricingRuleId: o.id, action: "EXPIRED", oldPricePaise: o.pricePerKgPaise, actorId: actor.id, note: `Superseded by new rate from ${rule.effectiveFrom.toISOString().slice(0, 10)}` } });
    }
    const r = await tx.pricingRule.update({ where: { id: ruleId }, data: { approvalStatus: "APPROVED", approvedById: actor.id, approvedAt: new Date() } });
    await tx.pricingHistory.create({
      data: { pricingRuleId: ruleId, action: "APPROVED", oldPricePaise: overlapping[0]?.pricePerKgPaise ?? null, newPricePaise: r.pricePerKgPaise, actorId: actor.id, note },
    });
    await audit(tx, actor, "pricing.approve", "PricingRule", ruleId, { before: rule, after: r });
    return r;
  });
}

export async function deactivateRule(actor: Actor, ruleId: string) {
  assertPermission(actor, "pricing:manage");
  return transaction(async (tx) => {
    const rule = await tx.pricingRule.update({ where: { id: ruleId }, data: { active: false } });
    await tx.pricingHistory.create({ data: { pricingRuleId: ruleId, action: "DEACTIVATED", oldPricePaise: rule.pricePerKgPaise, actorId: actor.id } });
    await audit(tx, actor, "pricing.deactivate", "PricingRule", ruleId);
    return rule;
  });
}
