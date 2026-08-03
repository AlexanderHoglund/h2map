import type { Metadata } from "next";
import ResetPasswordClient from "./ResetPasswordClient";

export const metadata: Metadata = { title: "Reset password — Thaduberg" };

/**
 * Landing target of the password-recovery email (/auth/confirm?type=recovery
 * redirects here after verifyOtp establishes the recovery session). Public
 * in the proxy: with no session the client shows "link expired".
 */
export default function ResetPasswordPage() {
  return <ResetPasswordClient />;
}
