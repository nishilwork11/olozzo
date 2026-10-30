import type { LucideIcon } from "lucide-react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { SUNSET } from "@/lib/theme";
import { cn } from "@/lib/utils";

/**
 * The Sunset logo: the ringed mark is the first "o" of olozzo, followed by "lozzo" in the rounded logo face.
 * `light` is for dark backgrounds (the purple parts turn cream).
 */
export function Logo({ className, light = false }: { className?: string; light?: boolean }) {
  const ink = light ? SUNSET.cream : SUNSET.purple;
  return (
    <Link
      href="/"
      aria-label="olozzo home"
      className={cn(
        "inline-flex items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
        className,
      )}
    >
      {/* Cropped to the artwork; overflow stays visible in case the fallback font runs a little wider */}
      <svg viewBox="66 84 628 223" className="h-9 w-auto overflow-visible" aria-hidden="true" focusable="false">
        <circle cx="193" cy="180" r="106" fill="none" stroke={SUNSET.yellow} strokeWidth="34" strokeLinecap="round" strokeDasharray="420 246" transform="rotate(-31 193 180)" />
        <circle cx="193" cy="180" r="75" fill="none" stroke={SUNSET.coral} strokeWidth="34" strokeLinecap="round" strokeDasharray="292 180" transform="rotate(76 193 180)" />
        <circle cx="193" cy="180" r="31" fill={ink} />
        <text x="327" y="234" fill={ink} fontSize="166" fontWeight="800" letterSpacing="-10" className="font-logo">
          lo<tspan fill={SUNSET.coral}>z</tspan>
          <tspan fill={SUNSET.yellow}>z</tspan>
          <tspan>o</tspan>
        </text>
      </svg>
    </Link>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("card", className)}>{children}</div>;
}

export function CardHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-ink-100 px-5 py-3.5">
      <h2 className="font-semibold text-ink-900">{title}</h2>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-ink-500">{label}</p>
        {Icon && (
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-50 text-brand-700">
            <Icon size={18} />
          </span>
        )}
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight text-ink-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700 ring-amber-600/20",
  UNPAID: "bg-amber-50 text-amber-700 ring-amber-600/20",
  REQUESTED: "bg-amber-50 text-amber-700 ring-amber-600/20",
  ACCEPTED: "bg-sky-50 text-sky-700 ring-sky-600/20",
  PROCESSING: "bg-sky-50 text-sky-700 ring-sky-600/20",
  SHIPPED: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  DELIVERED: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  PAID: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  APPROVED: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  ACTIVE: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  CANCELLED: "bg-ink-100 text-ink-600 ring-ink-500/20",
  REFUNDED: "bg-purple-50 text-purple-700 ring-purple-600/20",
  FAILED: "bg-red-50 text-red-700 ring-red-600/20",
  REJECTED: "bg-red-50 text-red-700 ring-red-600/20",
  SUSPENDED: "bg-red-50 text-red-700 ring-red-600/20",
  // Emails (EmailLog)
  QUEUED: "bg-amber-50 text-amber-700 ring-amber-600/20",
  SENDING: "bg-sky-50 text-sky-700 ring-sky-600/20",
  SENT: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  SKIPPED: "bg-ink-100 text-ink-600 ring-ink-500/20",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        STATUS_STYLES[status] ?? "bg-ink-100 text-ink-700 ring-ink-500/20",
        className,
      )}
    >
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

export function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-700", className)}>
      {children}
    </span>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-ink-100 text-ink-500">
        <Icon size={22} />
      </span>
      <h3 className="mt-4 font-semibold text-ink-900">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Shows ?ok= / ?error= flash messages set by server actions. */
export function Flash({ ok, error }: { ok?: string | string[]; error?: string | string[] }) {
  const okMsg = Array.isArray(ok) ? ok[0] : ok;
  const errMsg = Array.isArray(error) ? error[0] : error;
  if (!okMsg && !errMsg) return null;
  return (
    <div
      className={cn(
        "mb-5 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm",
        errMsg ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800",
      )}
      role="status"
    >
      {errMsg ? <AlertCircle size={18} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={18} className="mt-0.5 shrink-0" />}
      <span>{errMsg ?? okMsg}</span>
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="label">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}

/** Minimal dependency-free bar chart. */
export function BarChart({
  data,
  format = (v) => String(v),
  height = 160,
}: {
  data: { label: string; value: number }[];
  format?: (v: number) => string;
  height?: number;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div>
      <div className="flex items-end gap-1.5" style={{ height }}>
        {data.map((d) => (
          <div key={d.label} className="group relative flex h-full flex-1 flex-col justify-end">
            <div
              className="rounded-t-md bg-brand-500/80 transition group-hover:bg-brand-600"
              style={{ height: `${Math.max(2, (d.value / max) * 100)}%` }}
            />
            <div className="pointer-events-none absolute -top-8 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-ink-900 px-2 py-1 text-xs text-white group-hover:block">
              {format(d.value)}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-1.5">
        {data.map((d, i) => (
          <div key={d.label} className="flex-1 text-center text-[10px] text-ink-400">
            {i % 2 === 0 ? d.label : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProductThumb({ src, alt, className }: { src?: string | null; alt: string; className?: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={cn("rounded-lg bg-ink-100 object-cover", className)} loading="lazy" />
  ) : (
    <div className={cn("rounded-lg bg-gradient-to-br from-ink-100 to-ink-200", className)} />
  );
}
