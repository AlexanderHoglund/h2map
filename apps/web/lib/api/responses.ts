import type { ZodError } from "zod";

export function jsonError(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): Response {
  return Response.json(
    { error: { code, message, ...(details === undefined ? {} : { details }) } },
    { status },
  );
}

export function validationError(error: ZodError): Response {
  return jsonError(
    400,
    "validation_error",
    "Request failed validation",
    error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
  );
}

export function rateLimited(retryAfterSeconds: number): Response {
  return Response.json(
    {
      error: {
        code: "rate_limited",
        message: "Too many requests — retry later",
      },
    },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}
