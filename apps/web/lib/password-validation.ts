export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  errors: string[];
  isValid: boolean;
}

export function validatePassword(password: string): PasswordStrength {
  if (password.length === 0) {
    return {
      score: 0,
      label: "",
      errors: [],
      isValid: false
    };
  }

  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumber = /\d/.test(password);

  const errors: string[] = [];
  if (!hasMinLength) {
    errors.push("Use at least 8 characters");
  }
  if (!hasUppercase) {
    errors.push("Add a capital letter");
  }
  if (!hasNumber) {
    errors.push("Add a number");
  }

  let score: 0 | 1 | 2 | 3 | 4 = 1;
  if (hasMinLength && hasUppercase && hasNumber) {
    score = password.length >= 12 ? 4 : 3;
  } else if (hasMinLength && (hasUppercase || hasNumber)) {
    score = 2;
  } else if (hasMinLength) {
    score = 1;
  }

  const label =
    score === 4 ? "Strong" :
    score === 3 ? "Good" :
    score === 2 ? "Fair" :
    "Weak";

  return {
    score,
    label,
    errors,
    isValid: hasMinLength && hasUppercase && hasNumber
  };
}

export function mapAuthErrorMessage(message: string): string {
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes("invalid login credentials")) {
    return "Wrong email or password. Try again or reset your password.";
  }
  if (normalizedMessage.includes("user already registered")) {
    return "This email already has an account. Try signing in instead.";
  }
  if (normalizedMessage.includes("email not confirmed")) {
    return "Check your email and click the link we sent to finish signing up.";
  }
  if (normalizedMessage.includes("password should be at least")) {
    return "Use at least 8 characters with a capital letter and a number.";
  }
  if (normalizedMessage.includes("rate limit") || normalizedMessage.includes("too many")) {
    return "Too many attempts. Wait a few minutes and try again.";
  }

  return "Something went wrong. Try again.";
}
