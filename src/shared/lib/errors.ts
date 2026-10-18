export type DomainCode =
  | "email-taken"
  | "invalid-credentials"
  | "code-invalid"
  | "code-expired"
  | "code-limited"
  | "mail-unconfigured"
  | "mail-unavailable"
  | "email-unconfirmed"
  | "offline";

export class DomainError extends Error {
  readonly code: DomainCode;

  constructor(code: DomainCode) {
    super(code);
    this.code = code;
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}
