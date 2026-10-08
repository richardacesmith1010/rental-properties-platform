"use server";

import { revalidatePath } from "next/cache";
import { isActiveClientManager } from "@/lib/client-accounts";
import { checkRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { addClientHomeSchema, createClientAccountSchema, parseFormData } from "@/lib/validations";
import { requireAuth } from "./auth-helpers";
import type { ActionState } from "./shared";

const CLIENT_ERROR = "Could not add the client. Please try again.";
const HOME_ERROR = "Could not add the home. Please try again.";
const HOME_ACCESS_ERROR = "You can't add homes for this client.";

export async function createClientAccount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireAuth("manager");
  if (!checkRateLimit(`createClientAccount:${user.id}`, 20, 60 * 60 * 1000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }
  const parsed = parseFormData(createClientAccountSchema, formData);
  if (!parsed.success) return parsed;
  const { accountType, clientName, clientEmail } = parsed.data;
  try {
    const { data, error } = await createAdminClient().rpc("create_client_account", {
      p_manager: user.id, p_account_type: accountType, p_client_name: clientName,
      p_client_email: clientEmail ?? null
    });
    if (error) return {
      success: false,
      error: error.code === "22023" ? "Please check the details and try again." : CLIENT_ERROR
    };
    revalidatePath("/manager");
    return { success: true, message: "Client added.", accountId: data };
  } catch {
    return { success: false, error: CLIENT_ERROR };
  }
}

export async function addClientHome(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireAuth("manager");
  if (!checkRateLimit(`addClientHome:${user.id}`, 60, 60 * 60 * 1000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }
  const parsed = parseFormData(addClientHomeSchema, formData);
  if (!parsed.success) return parsed;
  const { accountId, name, addressLine1, city, state, postalCode, propertyType } = parsed.data;
  try {
    if (!(await isActiveClientManager(user.id, accountId))) {
      return { success: false, error: HOME_ACCESS_ERROR };
    }
  } catch {
    return { success: false, error: HOME_ACCESS_ERROR };
  }
  try {
    const { data, error } = await createAdminClient().rpc("add_client_home", {
      p_manager: user.id, p_account: accountId, p_name: name, p_address_line1: addressLine1,
      p_city: city, p_state: state, p_postal_code: postalCode, p_property_type: propertyType ?? null
    });
    if (error) return {
      success: false,
      error: error.code === "22023" ? "Please check the details and try again."
        : error.code === "42501" ? HOME_ACCESS_ERROR : HOME_ERROR
    };
    revalidatePath("/manager");
    return { success: true, message: "Home added.", propertyId: data };
  } catch {
    return { success: false, error: HOME_ERROR };
  }
}
