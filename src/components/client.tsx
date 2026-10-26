"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useFormStatus } from "react-dom";
import { SunsetLoader } from "@/components/SunsetLoader";
import { cn } from "@/lib/utils";

export function SubmitButton({
  children,
  className = "btn btn-primary",
  pendingText,
  confirm: confirmText,
  name,
  value,
  formAction,
}: {
  children: React.ReactNode;
  className?: string;
  pendingText?: string;
  confirm?: string;
  name?: string;
  value?: string;
  formAction?: (formData: FormData) => void | Promise<void>;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      name={name}
      value={value}
      formAction={formAction}
      onClick={(e) => {
        if (confirmText && !window.confirm(confirmText)) e.preventDefault();
      }}
    >
      {pending && <SunsetLoader size={18} tone="current" label={null} />}
      {pending && pendingText ? pendingText : children}
    </button>
  );
}

export function NavLink({
  href,
  children,
  exact = false,
  className,
  activeClassName = "bg-ink-900 text-white",
  inactiveClassName = "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
}: {
  href: string;
  children: React.ReactNode;
  exact?: boolean;
  className?: string;
  activeClassName?: string;
  inactiveClassName?: string;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link href={href} className={cn(className, active ? activeClassName : inactiveClassName)} aria-current={active ? "page" : undefined}>
      {children}
    </Link>
  );
}

/** Auto-submits its parent form when the value changes (used for inline selects in tables). */
export function AutoSubmitSelect({
  name,
  defaultValue,
  options,
  className = "input py-1.5 text-xs",
}: {
  name: string;
  defaultValue: string;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <select name={name} defaultValue={defaultValue} className={className} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
