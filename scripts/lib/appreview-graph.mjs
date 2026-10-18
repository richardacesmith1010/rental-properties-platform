import { deterministicUuid, ensureRowById, record, SeedRefusedError, sha256Hex } from "./seed-helpers.mjs";
import { demoPng } from "./demo-png.mjs";

const id = (label) => deterministicUuid(`appreview-${label}`);
const isoMonth = (year, month) => `${year}-${String(month).padStart(2, "0")}`;
function monthAt(now, offset) {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  return isoMonth(date.getUTCFullYear(), date.getUTCMonth() + 1);
}
function mark(summary, dryRun, action, label) {
  const status = action === "create" ? "created" : action === "update" ? "updated" : "existing";
  record(summary, dryRun && action !== "existing" ? `would-${action}` : status, label);
}
async function readOne(admin, table, filters, label) {
  let query = admin.from(table).select("*");
  for (const [key, value] of Object.entries(filters)) query = value === null ? query.is(key, null) : query.eq(key, value);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`Failed to read ${label}: ${error.message}`);
  return data;
}
async function readMany(admin, table, filters, label) {
  let query = admin.from(table).select("*");
  for (const [key, value] of Object.entries(filters)) query = value === null ? query.is(key, null) : query.eq(key, value);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to read ${label}: ${error.message}`);
  return data ?? [];
}
async function write(admin, table, operation, payload, filters, label, dryRun) {
  if (dryRun) return;
  let query = admin.from(table)[operation](payload);
  for (const [key, value] of Object.entries(filters ?? {})) query = query.eq(key, value);
  const { error } = await query;
  if (error) throw new Error(`Failed to ${operation} ${label}: ${error.message}`);
}
async function ensureSimple(admin, table, expected, parents, summary, label, dryRun) {
  return ensureRowById(admin, table, expected,
    (row) => Object.entries(parents).every(([key, value]) => row[key] === value), summary, label, dryRun);
}
async function ensureAccount(admin, ownerId, summary, dryRun) {
  const accountId = id("account");
  const row = await readOne(admin, "ownership_accounts", { id: accountId }, "demo account");
  if (!row) {
    const others = await readMany(admin, "ownership_accounts", {
      created_by_profile_id: ownerId, account_type: "individual"
    }, "individual accounts");
    if (others.some((other) => other.id !== accountId)) throw new SeedRefusedError("owner has another individual account");
  }
  await ensureSimple(admin, "ownership_accounts", {
    id: accountId, account_type: "individual", display_name: "Jordan Demo Homes", created_by_profile_id: ownerId
  }, { created_by_profile_id: ownerId }, summary, "ownership account", dryRun);
  const accountMembers = await readMany(admin, "ownership_account_members", { account_id: accountId },
    "account memberships");
  if (accountMembers.some((member) => member.profile_id !== ownerId)) {
    throw new SeedRefusedError(`foreign owner membership at demo account ${accountId}`);
  }
  const membership = { account_id: accountId, profile_id: ownerId, member_role: "owner",
    can_receive_critical_alerts: true, active: true };
  const existing = await readOne(admin, "ownership_account_members", { account_id: accountId, profile_id: ownerId },
    "owner membership");
  if (!existing) {
    await write(admin, "ownership_account_members", "insert", membership, null, "owner membership", dryRun);
    mark(summary, dryRun, "create", "owner membership");
  } else {
    const diff = Object.fromEntries(Object.entries(membership).filter(([key, value]) => existing[key] !== value));
    if (Object.keys(diff).length) {
      await write(admin, "ownership_account_members", "update", diff,
        { account_id: accountId, profile_id: ownerId }, "owner membership", dryRun);
      mark(summary, dryRun, "update", "owner membership");
    } else mark(summary, dryRun, "existing", "owner membership");
  }
  return accountId;
}
async function ensureHome(admin, ownerId, tenantId, accountId, summary, dryRun) {
  const propertyId = id("property");
  const unitId = id("unit");
  const leaseId = id("lease");
  const property = { id: propertyId, owner_account_id: accountId, owner_profile_id: ownerId,
    name: "Sample Lane House", address_line1: "42 Sample Lane", city: "Springfield", state: "IL",
    postal_code: "62704", property_type: "single_family", active: true };
  const conflict = await readMany(admin, "properties", { owner_account_id: accountId, name: property.name },
    "property name");
  if (conflict.some((row) => row.id !== propertyId)) throw new SeedRefusedError("property name belongs to another id");
  await ensureSimple(admin, "properties", property, { owner_account_id: accountId, owner_profile_id: ownerId },
    summary, "property", dryRun);
  const unit = { id: unitId, property_id: propertyId, unit_number: "Main", bedrooms: 2, bathrooms: 1,
    monthly_rent_cents: 400, occupied: true, active: true };
  const unitConflict = await readMany(admin, "units", { property_id: propertyId, unit_number: "Main" }, "unit name");
  if (unitConflict.some((row) => row.id !== unitId)) throw new SeedRefusedError("unit name belongs to another id");
  await ensureSimple(admin, "units", unit, { property_id: propertyId }, summary, "unit", dryRun);
  const lease = { id: leaseId, unit_id: unitId, tenant_profile_id: tenantId, start_date: "2026-07-01",
    end_date: "2028-06-30", monthly_rent_cents: 400, due_day_of_month: 1, grace_period_days: 5,
    late_fee_cents: 0, deposit_cents: 0, collects_outside_domus: false, lease_status: "active", active: true };
  const active = await readMany(admin, "leases", { unit_id: unitId, active: true }, "active leases");
  if (active.some((row) => row.id !== leaseId)) throw new SeedRefusedError("unit has another active lease");
  await ensureSimple(admin, "leases", lease, { unit_id: unitId, tenant_profile_id: tenantId },
    summary, "lease", dryRun);
  return { propertyId, unitId, leaseId };
}
async function ensureCharge(admin, leaseId, month, paid, summary, dryRun) {
  const dueDate = `${month}-01`;
  const chargeId = id(`charge-${month}`);
  const byId = await readOne(admin, "rent_charges", { id: chargeId }, `charge id ${month}`);
  if (byId && (byId.lease_id !== leaseId || byId.due_date !== dueDate || byId.category !== "rent")) {
    throw new SeedRefusedError(`foreign rent charge at demo id ${chargeId}`);
  }
  const rows = await readMany(admin, "rent_charges", { lease_id: leaseId, due_date: dueDate,
    category: "rent", deleted_at: null }, `rent charge ${month}`);
  if (rows.length > 1) throw new SeedRefusedError(`duplicate rent charge ${month}`);
  const charge = rows[0];
  if (charge && charge.lease_id !== leaseId) throw new SeedRefusedError(`foreign rent charge ${month}`);
  if (!charge) {
    await write(admin, "rent_charges", "insert", { id: chargeId, lease_id: leaseId, due_date: dueDate,
      category: "rent", amount_cents: 400, status: paid ? "paid" : "pending" }, null, `rent charge ${month}`, dryRun);
    mark(summary, dryRun, "create", `rent charge ${month}`);
  } else if (charge.amount_cents !== 400) throw new SeedRefusedError(`wrong rent amount ${month}`);
  const actualId = charge?.id ?? chargeId;
  if (!paid) {
    if (charge) mark(summary, dryRun, "existing", `rent charge ${month}`);
    return actualId;
  }
  const payments = await readMany(admin, "payments", { rent_charge_id: actualId, reversed_at: null },
    `payment ${month}`);
  if (charge?.status === "waived") {
    if (payments.length) throw new SeedRefusedError(`waived charge has payment ${month}`);
    mark(summary, dryRun, "existing", `rent charge ${month}`);
    return actualId;
  }
  if (payments.length > 1 || payments.some((payment) => payment.amount_cents !== 400)) {
    throw new SeedRefusedError(`conflicting payment ${month}`);
  }
  if (charge && ["pending", "late"].includes(charge.status)) {
    await write(admin, "rent_charges", "update", { status: "paid" }, { id: actualId },
      `rent charge ${month}`, dryRun);
    mark(summary, dryRun, "update", `rent charge ${month}`);
  } else if (charge) mark(summary, dryRun, "existing", `rent charge ${month}`);
  if (!payments.length) {
    let attempt = 0;
    let paymentId;
    while (true) {
      paymentId = id(attempt ? `payment-${month}-attempt-${attempt}` : `payment-${month}`);
      const prior = await readOne(admin, "payments", { id: paymentId }, `payment id ${month}`);
      if (!prior) break;
      if (prior.rent_charge_id !== actualId || prior.reversed_at == null) {
        throw new SeedRefusedError(`foreign payment at demo id ${paymentId}`);
      }
      attempt += 1;
    }
    await ensureSimple(admin, "payments", { id: paymentId, rent_charge_id: actualId,
      amount_cents: 400, method: "check", recorded_via: "manual", paid_at: `${dueDate}T15:00:00.000Z`,
      reference_note: "Demo payment" }, { rent_charge_id: actualId }, summary, `payment ${month}`, dryRun);
  } else mark(summary, dryRun, "existing", `payment ${month}`);
  return actualId;
}
async function ensureExpenses(admin, propertyId, ownerId, month, summary, dryRun) {
  for (const [slug, description, category, amount, day] of [
    ["gutter", "Gutter cleaning", "maintenance", 12000, "10"],
    ["porch", "Fix porch step", "repair", 6500, "20"]
  ]) {
    await ensureSimple(admin, "property_expenses", { id: id(`expense-${month}-${slug}`),
      property_id: propertyId, created_by_profile_id: ownerId, description, category,
      amount_cents: amount, expense_date: `${month}-${day}` }, { property_id: propertyId },
    summary, `expense ${month} ${slug}`, dryRun);
  }
}
async function ensureBank(admin, accountId, propertyId, chargeId, month, summary, dryRun) {
  const bankId = id("bank-account");
  const current = await readOne(admin, "bank_accounts", { id: bankId }, "bank connection");
  if (current?.connection_id) throw new SeedRefusedError("demo bank account has a connection");
  await ensureSimple(admin, "bank_accounts", { id: bankId, owner_account_id: accountId,
    institution: "Demo Bank", nickname: "Rent checking", source: "upload", mask: "4321",
    balance_cents: null, balance_as_of: null, balance_source: null },
  { owner_account_id: accountId }, summary, "bank account", dryRun);
  for (const offset of [-1, -2, -3]) {
    const staleMonth = monthAt(new Date(`${month}-01T00:00:00.000Z`), offset);
    const staleId = id(`bank-item-${staleMonth}-rent`);
    const stale = await readOne(admin, "bank_review_items", {
      id: staleId, owner_account_id: accountId, bank_account_id: bankId
    }, `old rent bank item ${staleMonth}`);
    if (!stale) continue;
    if (!dryRun) {
      const { error } = await admin.from("bank_review_items").delete().eq("id", staleId)
        .eq("owner_account_id", accountId).eq("bank_account_id", bankId);
      if (error) throw new Error(`Failed to delete old rent bank item ${staleMonth}: ${error.message}`);
    }
    record(summary, dryRun ? "would-delete" : "updated", `old rent bank item ${staleMonth}`);
  }
  const examples = [
    ["rent", "in", 400, "ZELLE FROM RILEY DEMO", {
      text: "Rent from Riley Demo · Sample Lane House", kind: "rent", rentChargeId: chargeId, propertyId }],
    ["plumber", "out", 8500, "SAMPLE PLUMBING REPAIR", {
      text: "Repair", kind: "expense", propertyId, category: "repair", label: "Repair" }],
    ["water", "out", 4218, "SAMPLE CITY WATER", {
      text: "Water", kind: "expense", propertyId, category: "utility", label: "Water" }]
  ];
  for (const [slug, direction, amount, description, suggestion] of examples) {
    const externalId = `appreview-${month}-${slug}`;
    const fingerprint = sha256Hex(`appreview|${bankId}|${externalId}`);
    const [filed, skipped] = await Promise.all([
      readOne(admin, "bank_transactions", { bank_account_id: bankId, external_id: externalId }, `filed ${slug}`),
      readOne(admin, "bank_skipped_fingerprints", { bank_account_id: bankId, fingerprint }, `skipped ${slug}`)
    ]);
    if (filed || skipped) {
      mark(summary, dryRun, "existing", `bank item ${month} ${slug}`);
      continue;
    }
    await ensureSimple(admin, "bank_review_items", { id: id(`bank-item-${month}-${slug}`),
      owner_account_id: accountId, bank_account_id: bankId, external_id: externalId, fingerprint,
      posted_on: `${month}-01`, amount_cents: amount, direction, description, suggestion },
    { owner_account_id: accountId, bank_account_id: bankId }, summary, `bank item ${month} ${slug}`, dryRun);
  }
}
async function ensureMessages(admin, propertyId, tenantId, ownerId, ownerEmail, now, summary, dryRun) {
  const subject = "Messages with your landlord";
  const existing = await readOne(admin, "inbox_threads", { property_id: propertyId,
    entity_type: "tenant_profile", entity_id: tenantId, subject }, "message thread");
  const threadId = existing?.id ?? id("thread");
  if (existing && (existing.property_id !== propertyId || existing.entity_id !== tenantId)) {
    throw new SeedRefusedError("foreign message thread");
  }
  await ensureSimple(admin, "inbox_threads", { id: threadId, property_id: propertyId,
    entity_type: "tenant_profile", entity_id: tenantId, subject, created_by_profile_id: tenantId },
  { property_id: propertyId, entity_id: tenantId }, summary, "message thread", dryRun);
  for (const [slug, sender, senderEmail, body, direction, hours] of [
    ["tenant", tenantId, null, "Hi! The kitchen sink drips. I sent a repair with a photo.", "inbound", 2],
    ["owner", ownerId, ownerEmail, "Thanks, Riley. A plumber will come this week.", "outbound", 1]
  ]) {
    const createdAt = new Date(now.getTime() - hours * 3600000).toISOString();
    await ensureSimple(admin, "inbox_messages", { id: id(`message-${slug}`), thread_id: threadId,
      sender_profile_id: sender, sender_email: senderEmail, body, channel: "in_app", direction,
      ...(!await readOne(admin, "inbox_messages", { id: id(`message-${slug}`) }, "message timestamp")
        ? { created_at: createdAt } : {}) }, { thread_id: threadId }, summary, `message ${slug}`, dryRun);
  }
}
async function ensureRepair(admin, propertyId, unitId, tenantId, summary, dryRun) {
  const ticketId = id("ticket");
  const photoId = id("photo");
  await ensureSimple(admin, "maintenance_tickets", { id: ticketId, property_id: propertyId,
    unit_id: unitId, tenant_profile_id: tenantId, title: "Kitchen sink drips",
    description: "Water drips under the kitchen sink. It started this week.", priority: "medium",
    status: "open", resolved_at: null }, { property_id: propertyId, unit_id: unitId,
    tenant_profile_id: tenantId }, summary, "repair", dryRun);
  const filename = `${photoId}-sink.png`;
  const path = `${ticketId}/${filename}`;
  const png = demoPng();
  const { data: objects, error: listError } = await admin.storage.from("maintenance-photos")
    .list(ticketId, { search: filename });
  if (listError) throw new Error(`Failed to list repair photos: ${listError.message}`);
  if (!objects?.some((object) => object.name === filename)) {
    if (!dryRun) {
      const { error } = await admin.storage.from("maintenance-photos")
        .upload(path, png, { contentType: "image/png", upsert: false });
      if (error) throw new Error(`Failed to upload repair photo: ${error.message}`);
    }
    mark(summary, dryRun, "create", "repair photo file");
  } else mark(summary, dryRun, "existing", "repair photo file");
  await ensureSimple(admin, "maintenance_photos", { id: photoId, ticket_id: ticketId,
    uploaded_by_profile_id: tenantId, storage_path: path, caption: "Drip under the sink",
    file_name: "sink.png", file_type: "image/png", file_size_bytes: png.length },
  { ticket_id: ticketId }, summary, "repair photo", dryRun);
}
export async function ensureAppReviewGraph({ admin, owner, tenant, now, summary, dryRun }) {
  const accountId = await ensureAccount(admin, owner.id, summary, dryRun);
  const { propertyId, unitId, leaseId } = await ensureHome(admin, owner.id, tenant.id,
    accountId, summary, dryRun);
  const currentMonth = monthAt(now, 0);
  for (const offset of [-3, -2, -1]) {
    const month = monthAt(now, offset);
    if (`${month}-01` >= "2026-07-01") await ensureCharge(admin, leaseId, month, true, summary, dryRun);
  }
  const chargeId = await ensureCharge(admin, leaseId, currentMonth, false, summary, dryRun);
  await ensureExpenses(admin, propertyId, owner.id, monthAt(now, -1), summary, dryRun);
  await ensureBank(admin, accountId, propertyId, chargeId, currentMonth, summary, dryRun);
  await ensureMessages(admin, propertyId, tenant.id, owner.id, owner.email, now, summary, dryRun);
  await ensureRepair(admin, propertyId, unitId, tenant.id, summary, dryRun);
  const [profile, account] = await Promise.all([
    readOne(admin, "profiles", { id: owner.id }, "owner Stripe profile"),
    readOne(admin, "ownership_accounts", { id: accountId }, "owner Stripe account")
  ]);
  if (profile?.stripe_account_id || profile?.stripe_onboarding_complete ||
      account?.stripe_account_id || account?.stripe_onboarding_complete) {
    console.warn("[appreview-seed] warning: demo Stripe is connected");
  }
  return { accountId, propertyId, unitId, leaseId, chargeId };
}
