"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useFormState } from "react-dom";
import { useRouter } from "next/navigation";
import { UserCircle2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/shared/submit-button";
import type { ActionState } from "@/app/actions";
import { Alert } from "@/components/ui/alert";

type StatefulAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

interface ProfileSettingsProps {
  email: string;
  fullName: string | null;
  nickname?: string | null;
  avatarUrl?: string | null;
  onUpdateProfile: StatefulAction;
}

function splitName(fullName: string | null) {
  const trimmed = fullName?.trim() ?? "";
  if (!trimmed) {
    return { firstName: "", lastName: "" };
  }

  const parts = trimmed.split(/\s+/);
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" ")
  };
}

export function ProfileSettings({
  email,
  fullName,
  nickname,
  avatarUrl,
  onUpdateProfile
}: ProfileSettingsProps) {
  const initialName = useMemo(() => splitName(fullName), [fullName]);
  const router = useRouter();
  const [firstName, setFirstName] = useState(initialName.firstName);
  const [lastName, setLastName] = useState(initialName.lastName);
  const [nicknameValue, setNicknameValue] = useState(nickname ?? "");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [state, formAction] = useFormState(onUpdateProfile, null);

  useEffect(() => {
    if (!previewUrl) {
      return;
    }

    return () => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    setFirstName(initialName.firstName);
    setLastName(initialName.lastName);
  }, [initialName.firstName, initialName.lastName]);

  useEffect(() => {
    setNicknameValue(nickname ?? "");
  }, [nickname]);

  useEffect(() => {
    if (!state?.success) {
      return;
    }

    setPreviewUrl(null);
    setFileInputKey((current) => current + 1);
    router.refresh();
  }, [router, state]);

  function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      setPreviewUrl(null);
      return;
    }

    setPreviewUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return URL.createObjectURL(file);
    });
  }

  function clearAvatarSelection() {
    setPreviewUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return null;
    });
    setFileInputKey((current) => current + 1);
  }

  const resolvedAvatar = previewUrl ?? avatarUrl ?? null;

  return (
    <form action={formAction} className="space-y-4">
      <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Email</p>
        <p className="mt-1 text-sm font-medium text-[var(--ink)]">{email}</p>
      </div>

      <div className="flex items-center gap-4 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-4 py-4">
        <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-[var(--line)] bg-[var(--surface)]">
          {resolvedAvatar ? (
            <Image
              src={resolvedAvatar}
              alt="Profile preview"
              width={80}
              height={80}
              sizes="80px"
              className="h-full w-full object-cover"
              unoptimized
            />
          ) : (
            <UserCircle2 className="h-10 w-10 text-[var(--faint)]" />
          )}
        </div>

        <div className="space-y-2">
          <input
            key={fileInputKey}
            id="settings-avatar"
            name="avatarFile"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleAvatarChange}
            className="block text-sm text-[var(--ink-2)] file:mr-3 file:rounded-md file:border-0 file:bg-[var(--accent-weak)] file:px-3 file:py-2 file:text-sm file:font-medium file:text-[var(--accent)] hover:file:bg-[var(--accent-line)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-line)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ground)]"
          />
          <p className="text-xs text-[var(--muted)]">JPG, PNG, or WebP up to 5MB.</p>
          {previewUrl ? (
            <button
              type="button"
              onClick={clearAvatarSelection}
              className="inline-flex items-center gap-1 rounded text-sm font-medium text-[var(--ink-2)] underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-line)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ground)]"
              title="Remove the selected photo before saving."
            >
              <X className="h-3.5 w-3.5" />
              Remove
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="settings-first-name" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
            First Name
          </label>
          <Input
            id="settings-first-name"
            name="firstName"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            placeholder="First name"
            required
          />
        </div>

        <div>
          <label htmlFor="settings-last-name" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
            Last Name
          </label>
          <Input
            id="settings-last-name"
            name="lastName"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            placeholder="Last name"
            required
          />
        </div>
      </div>

      <div>
        <label htmlFor="settings-nickname" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
          Nickname
        </label>
        <Input
          id="settings-nickname"
          name="nickname"
          value={nicknameValue}
          onChange={(event) => setNicknameValue(event.target.value)}
          placeholder="What should we call you?"
        />
      </div>

      {state && !state.success ? (
        <Alert variant="error">
          {state.error}
        </Alert>
      ) : null}

      {state?.success && state.message ? (
        <Alert variant="success">
          {state.message}
        </Alert>
      ) : null}

      <SubmitButton title="Save your profile details.">
        Save Profile
      </SubmitButton>
    </form>
  );
}
