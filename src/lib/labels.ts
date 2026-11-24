// Human-readable labels and tones for enum values (safe for client + server).

export type Tone = "neutral" | "green" | "amber" | "red" | "blue" | "sage";

export const bookingStatus: Record<string, { label: string; tone: Tone }> = {
  SCHEDULED: { label: "Scheduled", tone: "blue" },
  ASSIGNED: { label: "Collector assigned", tone: "blue" },
  EN_ROUTE: { label: "On the way", tone: "amber" },
  IN_PROGRESS: { label: "Collecting", tone: "amber" },
  AWAITING_APPROVAL: { label: "Awaiting your approval", tone: "amber" },
  APPROVED: { label: "Valuation approved", tone: "sage" },
  COMPLETED: { label: "Completed", tone: "green" },
  DISPUTED: { label: "Under dispute", tone: "red" },
  RETURNED: { label: "Returned", tone: "neutral" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  FAILED: { label: "Pickup failed", tone: "red" },
};

export const payoutStatus: Record<string, { label: string; tone: Tone }> = {
  AWAITING_APPROVAL: { label: "Awaiting approval", tone: "amber" },
  APPROVED: { label: "Approved", tone: "sage" },
  INITIATED: { label: "Payout initiated", tone: "blue" },
  PROCESSING: { label: "Processing", tone: "blue" },
  SUCCESSFUL: { label: "Successful", tone: "green" },
  FAILED: { label: "Failed", tone: "red" },
  REVERSED: { label: "Reversed", tone: "red" },
  UNDER_REVIEW: { label: "Under review", tone: "amber" },
};

export const orderStatus: Record<string, { label: string; tone: Tone }> = {
  PENDING_PAYMENT: { label: "Pending payment", tone: "amber" },
  PAID: { label: "Paid", tone: "sage" },
  PACKED: { label: "Packed", tone: "blue" },
  SHIPPED: { label: "Shipped", tone: "blue" },
  DELIVERED: { label: "Delivered", tone: "green" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  REFUNDED: { label: "Refunded", tone: "neutral" },
};

export const poStatus: Record<string, { label: string; tone: Tone }> = {
  REQUESTED: { label: "Requested", tone: "blue" },
  NEGOTIATING: { label: "Negotiating", tone: "amber" },
  CONFIRMED: { label: "Confirmed", tone: "sage" },
  DISPATCHED: { label: "Dispatched", tone: "blue" },
  DELIVERED: { label: "Delivered", tone: "green" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

export const verificationStatus: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: "Pending verification", tone: "amber" },
  VERIFIED: { label: "Verified", tone: "green" },
  REJECTED: { label: "Rejected", tone: "red" },
  SUSPENDED: { label: "Suspended", tone: "red" },
};

export const gradeLabel: Record<string, { label: string; tone: Tone }> = {
  UNSORTED: { label: "Unsorted", tone: "neutral" },
  PREMIUM_REUSABLE: { label: "Premium reusable", tone: "green" },
  STANDARD_REUSABLE: { label: "Standard reusable", tone: "sage" },
  REPAIRABLE: { label: "Repairable", tone: "amber" },
  RECYCLABLE: { label: "Recyclable", tone: "blue" },
  UPCYCLING: { label: "Upcycling material", tone: "blue" },
  REJECTED: { label: "Rejected", tone: "red" },
};

export const channelLabel: Record<string, string> = {
  KG_BUYBACK: "Quick Sell by KG",
  PREMIUM_RESALE: "Premium Clothing Resale",
  RECYCLING: "Recycling",
  DONATION: "Donation",
};

export const businessTypeLabel: Record<string, string> = {
  THRIFT_STORE: "Thrift store",
  WHOLESALER: "Clothing wholesaler",
  TEXTILE_RECYCLER: "Textile recycler",
  UPCYCLER: "Upcycling business",
  GARMENT_MANUFACTURER: "Garment manufacturer",
  NGO: "NGO",
};

export const dispatchStatus: Record<string, { label: string; tone: Tone }> = {
  PLANNED: { label: "Planned", tone: "neutral" },
  DISPATCHED: { label: "Dispatched", tone: "blue" },
  DELIVERED: { label: "Delivered", tone: "sage" },
  SETTLED: { label: "Settled", tone: "green" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

export const donationStatus: Record<string, { label: string; tone: Tone }> = {
  BOOKED: { label: "Booked", tone: "blue" },
  COLLECTED: { label: "Collected", tone: "amber" },
  HANDED_OVER: { label: "Handed to partner", tone: "sage" },
  ACKNOWLEDGED: { label: "Acknowledged", tone: "green" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

export const roleLabel: Record<string, string> = {
  CUSTOMER: "Customer",
  COLLECTOR: "Pickup Executive",
  WAREHOUSE_MANAGER: "Warehouse Manager",
  ADMIN: "Admin",
  SUPER_ADMIN: "Super Admin",
  B2B_BUYER: "B2B Buyer",
  RECYCLER_PARTNER: "Recycler Partner",
  DONATION_PARTNER: "Donation Partner",
};

export const ticketStatus: Record<string, { label: string; tone: Tone }> = {
  OPEN: { label: "Open", tone: "amber" },
  IN_PROGRESS: { label: "In progress", tone: "blue" },
  RESOLVED: { label: "Resolved", tone: "green" },
  CLOSED: { label: "Closed", tone: "neutral" },
};
