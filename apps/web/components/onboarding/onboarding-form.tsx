"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useFormState } from "react-dom";
import { BriefcaseBusiness, Home, Upload, User, UserCircle2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/shared/submit-button";
import type { ActionState } from "@/app/actions";
import { Alert } from "@/components/ui/alert";

type StatefulAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024;

interface OnboardingFormProps {
  email: string;
  fullName: string | null;
  role: "owner" | "manager" | "tenant";
  onCompleteOnboarding: StatefulAction;
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

function getRoleMeta(role: OnboardingFormProps["role"]) {
  if (role === "owner") {
    return {
      label: "Owner",
      description: "You're signing up as an Owner.",
      Icon: Home
    };
  }
  if (role === "manager") {
    return {
      label: "Manager",
      description: "You're signing up as a Manager.",
      Icon: BriefcaseBusiness
    };
  }
  return {
    label: "Tenant",
    description: "You're signing up as a Tenant.",
    Icon: User
  };
}

export function OnboardingForm({
  email,
  fullName,
  role,
  onCompleteOnboarding
}: OnboardingFormProps) {
  const initialName = useMemo(() => splitName(fullName), [fullName]);
  const [firstName, setFirstName] = useState(initialName.firstName);
  const [lastName, setLastName] = useState(initialName.lastName);
  const [nickname, setNickname] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [state, formAction] = useFormState(onCompleteOnboarding, null);
  const roleMeta = getRoleMeta(role);
  const RoleIcon = roleMeta.Icon;

  useEffect(() => {
    if (!previewUrl) {
      return;
    }

    return () => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      setAvatarError(null);
      setPreviewUrl(null);
      return;
    }

    if (file.size > MAX_AVATAR_SIZE_BYTES) {
      setAvatarError("Image must be under 5 MB.");
      event.target.value = "";
      return;
    }

    setAvatarError(null);

    setPreviewUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return URL.createObjectURL(file);
    });
  }

  function clearAvatar() {
    setAvatarError(null);
    setPreviewUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return null;
    });
    setFileInputKey((current) => current + 1);
  }

  return (
    <form action={formAction} className="space-y-5">
      <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Email</p>
        <p className="mt-1 text-sm font-medium text-[var(--ink)]">{email}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="onboarding-first-name" className="block text-sm font-medium text-[var(--ink-2)]">
            First Name
          </label>
          <Input
            id="onboarding-first-name"
            name="firstName"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            placeholder="First name"
            required
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="onboarding-last-name" className="block text-sm font-medium text-[var(--ink-2)]">
            Last Name
          </label>
          <Input
            id="onboarding-last-name"
            name="lastName"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            placeholder="Last name"
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="onboarding-nickname" className="block text-sm font-medium text-[var(--ink-2)]">
          Nickname
        </label>
        <Input
          id="onboarding-nickname"
          name="nickname"
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
          placeholder="What should we call you?"
        />
      </div>

      <div className="space-y-3">
        <label htmlFor="onboarding-avatar" className="block text-sm font-medium text-[var(--ink-2)]">
          Profile Photo
        </label>
        <div className="flex items-center gap-4">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-[var(--line)] bg-[var(--surface-2)]">
            {previewUrl ? (
              <Image
                src={previewUrl}
                alt="Avatar preview"
                width={80}
                height={80}
                sizes="80px"
                className="h-full w-full object-cover"
                unoptimized
              />
            ) : (
              <UserCircle2 className="h-10 w-10 text-[var(--muted)]" />
            )}
          </div>
          <div className="space-y-2">
            <input
              key={fileInputKey}
              id="onboarding-avatar"
              name="avatarFile"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleAvatarChange}
              className="block text-sm text-[var(--ink-2)] file:mr-3 file:rounded-xl file:border file:border-[var(--line)] file:bg-[var(--surface)] file:px-3 file:py-2 file:text-sm file:font-medium file:text-[var(--accent)] hover:file:border-[var(--accent-line)] hover:file:bg-[var(--accent-weak)]"
            />
            <p className="mt-1 text-xs domus-muted">JPG, PNG, or WebP. Max 5 MB.</p>
            {avatarError ? (
              <p className="mt-1 text-xs text-[var(--crit)]">{avatarError}</p>
            ) : null}
            {previewUrl ? (
              <button
                type="button"
                onClick={clearAvatar}
                className="inline-flex items-center gap-1 rounded-lg text-sm font-medium text-[var(--ink-2)] underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-line)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ground)]"
                title="Remove the selected profile photo."
              >
                <X className="h-3.5 w-3.5" />
                Remove
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--accent-line)] bg-[var(--accent-weak)] px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--accent)] shadow-[var(--domus-shadow-sm)]">
            <RoleIcon className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[var(--ink)]">{roleMeta.description} <span className="text-[var(--pos)]">✓</span></p>
            <p className="text-xs text-[var(--ink-2)]">Role changes are handled by invitations and account setup.</p>
          </div>
        </div>
      </div>

      {state && !state.success ? (
        <Alert variant="error">
          {state.error}
        </Alert>
      ) : null}

      <SubmitButton
        className="w-full"
        title="Save your profile and complete setup."
      >
        <Upload className="mr-2 h-4 w-4" />
        Complete Setup
      </SubmitButton>
    </form>
  );
}
