-- Business-rule constraints enforced by the database itself (defence in depth).

-- Free pickup is a permanent customer policy: no booking can ever carry a pickup fee.
ALTER TABLE "Booking" ADD CONSTRAINT "booking_free_pickup" CHECK ("pickupFeePaise" = 0);
ALTER TABLE "Booking" ADD CONSTRAINT "booking_estimate_non_negative" CHECK ("estimatedGrams" > 0 AND "estimatedPaise" >= 0 AND "bagCount" > 0);

-- Weighing integrity: net = gross - tare, never negative.
ALTER TABLE "WeighingRecord" ADD CONSTRAINT "weighing_net_matches" CHECK ("netGrams" = "grossGrams" - "tareGrams" AND "netGrams" >= 0 AND "tareGrams" >= 0);

-- Valuation arithmetic.
ALTER TABLE "Valuation" ADD CONSTRAINT "valuation_payable_matches" CHECK ("payablePaise" = "subtotalPaise" - "deductionPaise" AND "payablePaise" >= 0 AND "deductionPaise" >= 0);

-- Payout amounts must be positive.
ALTER TABLE "Payout" ADD CONSTRAINT "payout_amount_positive" CHECK ("amountPaise" > 0);

-- Pricing rules: non-negative and expiry after start.
ALTER TABLE "PricingRule" ADD CONSTRAINT "pricing_rule_valid" CHECK ("pricePerKgPaise" >= 0 AND ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom"));

-- Inventory never goes negative.
ALTER TABLE "InventoryItem" ADD CONSTRAINT "inventory_non_negative" CHECK ("weightGrams" >= 0 AND "quantity" >= 0);
ALTER TABLE "MarketplaceProduct" ADD CONSTRAINT "product_stock_valid" CHECK ("quantity" >= 0 AND "reserved" >= 0 AND "reserved" <= "quantity" AND "pricePaise" > 0);
ALTER TABLE "BusinessListing" ADD CONSTRAINT "listing_stock_valid" CHECK ("availableGrams" >= 0 AND "reservedGrams" >= 0 AND "reservedGrams" <= "availableGrams" AND "minOrderGrams" > 0);

-- Ledger amounts are always positive; direction carries the sign.
ALTER TABLE "FinancialLedger" ADD CONSTRAINT "ledger_amount_positive" CHECK ("amountPaise" > 0);

-- Ratings 1..5
ALTER TABLE "Review" ADD CONSTRAINT "review_rating_range" CHECK ("rating" BETWEEN 1 AND 5);

-- At most one active collector assignment per booking.
CREATE UNIQUE INDEX "pickup_assignment_one_active" ON "PickupAssignment" ("bookingId") WHERE "active" = true;

-- At most one primary UPI account per user.
CREATE UNIQUE INDEX "upi_account_one_primary" ON "UpiAccount" ("userId") WHERE "isPrimary" = true AND "deletedAt" IS NULL;
