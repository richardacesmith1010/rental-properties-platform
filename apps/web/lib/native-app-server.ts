import "server-only";
import { headers } from "next/headers";
import { isNativeApp } from "./native-app";

// Kept separate so next/headers never enters a client bundle.
export async function isNativeAppServer(): Promise<boolean> {
  return isNativeApp((await headers()).get("user-agent"));
}
