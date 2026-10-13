"use server";

import type { ActionState } from "./shared";

const MOVED = "Use Connect a bank on the Bank page.";

export async function initiatePlaidLink(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  return { success: false, error: MOVED };
}

export async function completePlaidLink(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  return { success: false, error: MOVED };
}

export async function refreshPlaidBalance(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  return { success: false, error: MOVED };
}

export async function disconnectPlaid(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  return { success: false, error: MOVED };
}
