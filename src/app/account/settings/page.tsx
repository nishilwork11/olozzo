import { Download } from "lucide-react";
import { SubmitButton } from "@/components/client";
import { Card, Field, Flash } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { changePassword, deleteAccount, updateProfile } from "../actions";

export default async function AccountSettings({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const flash = await searchParams;
  const sessionUser = await requireUser();
  const user = await db.user.findUniqueOrThrow({ where: { id: sessionUser.id } });

  return (
    <div className="space-y-6">
      <Flash {...flash} />
      <Card className="p-6">
        <h2 className="font-semibold">Profile</h2>
        <form action={updateProfile} className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="name">
            <input id="name" name="name" defaultValue={user.name} required className="input" />
          </Field>
          <Field label="Email" htmlFor="email" hint="Contact support to change your email.">
            <input id="email" value={user.email} disabled className="input" />
          </Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="marketingOptIn" defaultChecked={user.marketingOptIn} className="h-4 w-4" />
            Send me news and offers by email (you can withdraw consent at any time)
          </label>
          <div>
            <SubmitButton className="btn btn-dark">Save profile</SubmitButton>
          </div>
        </form>
      </Card>

      <Card className="p-6">
        <h2 className="font-semibold">Change password</h2>
        <form action={changePassword} className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Current password" htmlFor="current">
            <input id="current" name="current" type="password" required autoComplete="current-password" className="input" />
          </Field>
          <Field label="New password" htmlFor="next">
            <input id="next" name="next" type="password" minLength={8} required autoComplete="new-password" className="input" />
          </Field>
          <div>
            <SubmitButton className="btn btn-secondary">Update password</SubmitButton>
          </div>
        </form>
      </Card>

      <Card className="p-6">
        <h2 className="font-semibold">Your data (GDPR)</h2>
        <p className="mt-1 text-sm text-ink-500">
          Download a machine-readable copy of everything we store about you (Art. 15 & 20 GDPR).
        </p>
        <a href="/api/account/export" className="btn btn-secondary mt-4">
          <Download size={16} /> Download my data (JSON)
        </a>
      </Card>

      <Card className="border-red-200 p-6">
        <h2 className="font-semibold text-red-700">Delete account</h2>
        <p className="mt-1 text-sm text-ink-500">
          Permanently deletes your login and profile (Art. 17 GDPR). Past orders are kept anonymised from your account for the
          10-year statutory tax retention period.
        </p>
        <form action={deleteAccount} className="mt-4 flex flex-wrap gap-2">
          <input name="confirm" placeholder="Type DELETE to confirm" className="input max-w-xs" />
          <SubmitButton className="btn btn-danger" confirm="This cannot be undone. Delete your account?">
            Delete my account
          </SubmitButton>
        </form>
      </Card>
    </div>
  );
}
