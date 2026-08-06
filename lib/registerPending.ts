/** sessionStorage bridge between /register (name/phone/referral, sends the
 *  SMS code) and /register/confirmar (password/code, actually creates the
 *  account). Deliberately carries no password or OTP code — nothing here is
 *  sensitive, so sessionStorage (not a server round-trip) is an acceptable
 *  way to hand it across the page navigation. Cleared once registration
 *  actually succeeds or the user backs out via "Usar outro número". */
export const REGISTER_PENDING_KEY = "duelobet:register-pending";

export type RegisterPendingData = {
  displayName: string;
  phone: string;
  referralCode?: string;
};
