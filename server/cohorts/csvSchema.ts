import { z } from "zod";

export const CSV_COLUMNS = [
  "tenant_id", "restaurant_id", "tier_base", "segment", "signup_date", "zone", "cuisine",
  "committed_hours_week", "order_date", "gross_value", "fee", "payment_status", "cancelled_by",
  "discount_pct", "has_photo", "has_description",
] as const;

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");
const num = z.coerce.number();
const optNum = z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().optional());
const optBool = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v === "true" ? true : v === "false" ? false : v),
  z.boolean().optional(),
);
const optEmpty = (s: z.ZodTypeAny) => z.preprocess((v) => (v === "" || v == null ? undefined : v), s);

export const csvRowSchema = z.object({
  tenant_id: z.string().min(1),
  restaurant_id: z.string().min(1),
  tier_base: z.enum(["managed_brand", "managed_midmarket", "long_tail"]),
  segment: z.enum(["managed", "long_tail"]),
  signup_date: date,
  zone: z.string().min(1),
  cuisine: z.string().min(1),
  committed_hours_week: num.nonnegative(),
  order_date: date,
  gross_value: num.nonnegative(),
  fee: optNum,
  payment_status: z.enum(["ok", "failed", "pending"]),
  cancelled_by: optEmpty(z.enum(["restaurant", "customer"]).optional()),
  discount_pct: optNum,
  has_photo: optBool,
  has_description: optBool,
});
export type CsvRow = z.infer<typeof csvRowSchema>;

export const REST_KEYS = ["tenant_id", "tier_base", "segment", "signup_date", "zone", "cuisine", "committed_hours_week"] as const;
