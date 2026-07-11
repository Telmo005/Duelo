import { forwardRef } from "react";
import { Input } from "@/components/ui/input";

type PhoneInputProps = React.ComponentProps<typeof Input>;

/** Phone input for a Mozambique number. Caller supplies "+258 " as the
 *  starting value (defaultValue for uncontrolled forms, or the initial
 *  controlled state) — this component just moves the cursor to the end on
 *  focus, so typing always continues right after the prefix instead of the
 *  user having to click past it, and caps the length to the full
 *  "+258 84 XXX XXXX" format. */
export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(function PhoneInput(
  { onFocus, maxLength = 16, ...props },
  ref
) {
  return (
    <Input
      ref={ref}
      type="tel"
      inputMode="tel"
      maxLength={maxLength}
      onFocus={(e) => {
        const el = e.currentTarget;
        requestAnimationFrame(() => el.setSelectionRange(el.value.length, el.value.length));
        onFocus?.(e);
      }}
      {...props}
    />
  );
});
