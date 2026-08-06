-- =============================================================
-- Migration: 0040_otp_request_auth_attempts_kind
--
-- lib/rateLimit.ts's checkOtpRequestRateLimit/recordOtpRequestAttempt
-- (added for phone verification at registration, see 0039_phone_otps.sql)
-- write rows with kind='otp_request', but the check constraint from
-- 0023_security_hardening.sql only ever allowed 'login'/'register' — every
-- one of those inserts has been failing silently (caught and only
-- console.error'd in recordOtpRequestAttempt, per its own fail-open
-- design) since that feature shipped. Caught via manual browser testing,
-- not by any automated check, since the failure never surfaced to a user.
-- =============================================================

alter table public.auth_attempts drop constraint if exists auth_attempts_kind_check;
alter table public.auth_attempts add constraint auth_attempts_kind_check
  check (kind in ('login', 'register', 'otp_request'));
