"use server";

import { renderToBuffer } from "@react-pdf/renderer";
import { revalidatePath } from "next/cache";
import { sendInvoiceEmail } from "@/lib/invoice-email";
import { sideEffectError } from "@/lib/logger";
import {
  getUserNotificationPreferenceSettings,
  resolveNotificationDeliveryPreference
} from "@/lib/notification-preferences";
import {
  buildManagerInvoiceFileName,
  calculateConfiguredManagerPaymentAmount,
  formatManagerPaymentCategory,
  generateInvoiceNumber
} from "@/lib/manager-payments";
import { getManagerPaymentEmailContext } from "@/lib/manager-payments-data";
import { createInvoicePdfDocument } from "@/lib/pdf/invoice-template";
import { canUserAdministerProperty, getAdministeredProperties } from "@/lib/property-access";
import { checkRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  generateManagerPaymentsSchema,
  parseFormData,
  recordManagerPaymentSchema,
  setupManagerPaymentConfigSchema,
  updateManagerPaymentStatusSchema
} from "@/lib/validations";
import { requireAuth } from "./auth-helpers";
import type { ActionState } from "./shared";

async function ensureManagerAssigned(propertyId: string, managerProfileId: string) {
  const admin = createAdminClient();
  const { data: assignment } = await admin
    .from("property_managers")
    .select("property_id")
    .eq("property_id", propertyId)
    .eq("manager_profile_id", managerProfileId)
    .eq("active", true)
    .maybeSingle();

  return Boolean(assignment);
}

async function getPropertyBaseRentCents(propertyId: string) {
  const admin = createAdminClient();
  const { data: activeLeases } = await admin
    .from("leases")
    .select("monthly_rent_cents")
    .eq("property_id", propertyId)
    .eq("active", true);

  return (activeLeases ?? []).reduce((sum, lease) => sum + (lease.monthly_rent_cents ?? 0), 0);
}

async function sendManagerPaymentInvoiceEmails(
  actorUserId: string,
  paymentId: string,
  status: "pending" | "paid"
) {
  const notificationSettings = await getUserNotificationPreferenceSettings(actorUserId);
  const deliveryPreference = resolveNotificationDeliveryPreference(
    notificationSettings,
    "manager_invoice"
  );

  if (!deliveryPreference.emailEnabled) {
    // Email delivery skipped — preference or pause active
    return;
  }

  const context = await getManagerPaymentEmailContext(paymentId);
  if (!context) {
    return;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://domusbase.com";
  const invoiceUrl = `${appUrl}/api/pdf/invoice/${paymentId}`;
  const pdfBuffer = await renderToBuffer(
    createInvoicePdfDocument({
      invoice: context.pdfData
    })
  );
  const emailSent = context.managerEmail
    ? await sendInvoiceEmail({
        actorUserId,
        paymentId,
        propertyId: context.propertyId,
        managerName: context.managerName,
        managerEmail: context.managerEmail,
        ownerName: context.ownerName,
        ownerEmail: context.ownerEmail ?? null,
        amount: context.amountFormatted,
        description: context.description,
        propertyName: context.propertyName,
        invoiceNumber: context.pdfData.invoiceNumber,
        date: context.paymentDate,
        invoiceUrl,
        status,
        attachmentFileName: buildManagerInvoiceFileName(paymentId),
        attachmentContentBase64: Buffer.from(pdfBuffer).toString("base64")
      })
    : false;

  if (!emailSent) {
    throw new Error("Resend invoice delivery failed.");
  }
}

function revalidateManagerPaymentPaths() {
  revalidatePath("/");
  revalidatePath("/owner");
  revalidatePath("/manager");
}

export async function setupManagerPaymentConfig(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user } = await requireAuth("owner");
  if (!checkRateLimit(`setupManagerPaymentConfig:${user.id}`, 30, 60_000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const parsed = parseFormData(setupManagerPaymentConfigSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const {
    propertyId,
    managerProfileId,
    paymentType,
    percentageRate,
    flatAmountDollars,
    baseRentDollars,
    label,
    frequency
  } = parsed.data;

  if (!(await canUserAdministerProperty(user.id, propertyId))) {
    return { success: false, error: "You do not have access to this property." };
  }

  if (!(await ensureManagerAssigned(propertyId, managerProfileId))) {
    return { success: false, error: "Assign this manager to the property before creating payment terms." };
  }

  const admin = createAdminClient();
  const baseRentCents =
    baseRentDollars != null ? Math.round(baseRentDollars * 100) : await getPropertyBaseRentCents(propertyId);
  const payload = {
    property_id: propertyId,
    manager_profile_id: managerProfileId,
    payment_type: paymentType,
    percentage_rate: paymentType === "percentage" ? percentageRate ?? null : null,
    flat_amount_cents: paymentType === "flat" ? Math.round((flatAmountDollars ?? 0) * 100) : null,
    base_rent_cents: paymentType === "percentage" ? baseRentCents : null,
    label,
    frequency,
    active: true,
    updated_at: new Date().toISOString()
  };

  const { error } = await admin
    .from("manager_payment_configs")
    .upsert(payload, { onConflict: "property_id,manager_profile_id" });

  if (error) {
    return { success: false, error: error.message.includes("manager_payment_configs") ? error.message : "Unable to save manager payment terms right now." };
  }

  revalidateManagerPaymentPaths();
  return { success: true, message: "Recurring manager payment terms saved." };
}

export async function recordManagerPayment(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user } = await requireAuth("owner");
  if (!checkRateLimit(`recordManagerPayment:${user.id}`, 30, 60_000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const parsed = parseFormData(recordManagerPaymentSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { propertyId, managerProfileId, category, description, amountDollars, notes } = parsed.data;

  if (!(await canUserAdministerProperty(user.id, propertyId))) {
    return { success: false, error: "You do not have access to this property." };
  }

  if (!(await ensureManagerAssigned(propertyId, managerProfileId))) {
    return { success: false, error: "Assign this manager to the property before recording a payment." };
  }

  const admin = createAdminClient();
  const paymentId = crypto.randomUUID();
  const invoiceNumber = generateInvoiceNumber(paymentId);
  const { error } = await admin.from("manager_payments").insert({
    id: paymentId,
    property_id: propertyId,
    manager_profile_id: managerProfileId,
    category,
    description,
    amount_cents: Math.round(amountDollars * 100),
    status: "pending",
    payment_date: new Date().toISOString().slice(0, 10),
    invoice_number: invoiceNumber,
    notes: notes?.trim() || null,
    created_by: user.id
  });

  if (error) {
    return { success: false, error: "Unable to record this manager payment right now." };
  }

  void sendManagerPaymentInvoiceEmails(user.id, paymentId, "pending").catch(
    sideEffectError("recordManagerPayment", "email_invoice", {
      userId: user.id,
      entityType: "manager_payment",
      entityId: paymentId
    })
  );

  revalidateManagerPaymentPaths();
  return {
    success: true,
    message: `${formatManagerPaymentCategory(category)} recorded.`,
    paymentId
  };
}

async function updateManagerPaymentStatus(
  userId: string,
  paymentId: string,
  status: "paid" | "cancelled"
): Promise<ActionState> {
  const admin = createAdminClient();
  const { data: payment } = await admin
    .from("manager_payments")
    .select("id, property_id")
    .eq("id", paymentId)
    .maybeSingle();

  if (!payment) {
    return { success: false, error: "Manager payment not found." };
  }

  if (!(await canUserAdministerProperty(userId, payment.property_id))) {
    return { success: false, error: "You do not have access to this payment." };
  }

  const { error } = await admin
    .from("manager_payments")
    .update({
      status,
      paid_at: status === "paid" ? new Date().toISOString() : null
    })
    .eq("id", paymentId);

  if (error) {
    return { success: false, error: `Unable to mark this payment as ${status}.` };
  }

  if (status === "paid") {
    void sendManagerPaymentInvoiceEmails(userId, paymentId, "paid").catch(
      sideEffectError("markManagerPaymentPaid", "email_invoice", {
        userId,
        entityType: "manager_payment",
        entityId: paymentId
      })
    );
  }

  revalidateManagerPaymentPaths();
  return {
    success: true,
    message: status === "paid" ? "Payment marked paid." : "Payment cancelled.",
    paymentId
  };
}

export async function markManagerPaymentPaid(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user } = await requireAuth("owner");
  const parsed = parseFormData(updateManagerPaymentStatusSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  if (parsed.data.status !== "paid") {
    return { success: false, error: "Invalid payment status update." };
  }

  return updateManagerPaymentStatus(user.id, parsed.data.paymentId, "paid");
}

export async function cancelManagerPayment(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user } = await requireAuth("owner");
  const parsed = parseFormData(updateManagerPaymentStatusSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  if (parsed.data.status !== "cancelled") {
    return { success: false, error: "Invalid payment status update." };
  }

  return updateManagerPaymentStatus(user.id, parsed.data.paymentId, "cancelled");
}

export async function generateMonthlyManagerPayments(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user } = await requireAuth("owner");
  const parsed = parseFormData(generateManagerPaymentsSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const admin = createAdminClient();
  const today = new Date();
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const monthEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);

  const propertyIds = parsed.data.propertyId
    ? [parsed.data.propertyId]
    : (await getAdministeredProperties(user.id)).map((property) => property.id);

  if (propertyIds.length === 0) {
    return { success: false, error: "No properties are available for manager payment generation." };
  }

  const { data: configs, error: configsError } = await admin
    .from("manager_payment_configs")
    .select(
      "id, property_id, manager_profile_id, payment_type, percentage_rate, flat_amount_cents, base_rent_cents, label, frequency, active"
    )
    .in("property_id", propertyIds)
    .eq("active", true);

  if (configsError) {
    return { success: false, error: "Unable to load recurring manager payment terms." };
  }

  const configIds = (configs ?? []).map((config) => config.id);
  const { data: existingPayments } = configIds.length
    ? await admin
        .from("manager_payments")
        .select("config_id")
        .in("config_id", configIds)
        .gte("payment_date", monthStart)
        .lte("payment_date", monthEnd)
    : { data: [] as Array<{ config_id: string | null }> };
  const existingConfigIds = new Set((existingPayments ?? []).map((payment) => payment.config_id).filter(Boolean));

  const rowsToInsert = (configs ?? [])
    .filter((config) => !existingConfigIds.has(config.id))
    .map((config) => {
      const paymentId = crypto.randomUUID();
      return {
        id: paymentId,
        property_id: config.property_id,
        manager_profile_id: config.manager_profile_id,
        config_id: config.id,
        category: "commission" as const,
        description: `${config.label} - ${today.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}`,
        amount_cents: calculateConfiguredManagerPaymentAmount({
          paymentType: config.payment_type,
          percentageRate: config.percentage_rate,
          flatAmountCents: config.flat_amount_cents,
          baseRentCents: config.base_rent_cents
        }),
        status: "pending" as const,
        payment_date: monthStart,
        invoice_number: generateInvoiceNumber(paymentId, today),
        notes: null,
        created_by: user.id
      };
    })
    .filter((row) => row.amount_cents > 0);

  if (rowsToInsert.length === 0) {
    return { success: true, message: "No new monthly manager payments were needed." };
  }

  const { error: insertError } = await admin.from("manager_payments").insert(rowsToInsert);
  if (insertError) {
    return { success: false, error: "Unable to generate this month's manager payments." };
  }

  void Promise.all(
    rowsToInsert.map((row) =>
      sendManagerPaymentInvoiceEmails(user.id, row.id, "pending").catch(
        sideEffectError("generateMonthlyManagerPayments", "email_invoice", {
          userId: user.id,
          entityType: "manager_payment",
          entityId: row.id
        })
      )
    )
  );

  revalidateManagerPaymentPaths();
  return {
    success: true,
    message: `Generated ${rowsToInsert.length} manager payment${rowsToInsert.length === 1 ? "" : "s"}.`
  };
}
