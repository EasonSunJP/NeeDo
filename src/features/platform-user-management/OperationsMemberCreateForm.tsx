import { useRef, useState, type FormEvent } from "react";
import { httpClient } from "../../api/httpClient";
import { Button } from "../../components/ui/Button";
import { useI18n } from "../../i18n/I18nProvider";
import { operationsMemberCopy } from "./operationsMemberCopy";

export function OperationsMemberCreateForm({ onCreated, onCancel }: { onCreated: (needoId: string) => void; onCancel: () => void }) {
  const { language } = useI18n();
  const copy = operationsMemberCopy[language];
  const submitting = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current) return;
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const body = { username: String(data.get("username")).trim(), email: String(data.get("email")).trim(), password: String(data.get("password")), reason: String(data.get("reason")).trim() };
    if (!body.username || !body.reason) return;
    submitting.current = true; setSaving(true); setError("");
    try {
      const result = await httpClient.request<{ needoId: string }>("/users/operations-members", { method: "POST", body });
      form.reset();
      onCreated(result.needoId);
    } catch (cause) {
      setError(cause && typeof cause === "object" && "code" in cause && cause.code === 40901 ? copy.duplicate : copy.failed);
    } finally { submitting.current = false; setSaving(false); }
  };
  const inputClass = "mt-1 w-full rounded-lg border border-line bg-white p-2 text-sm text-ink";
  return <form className="mb-4 rounded-xl border border-line bg-paper p-4" onSubmit={(event) => void submit(event)}>
    <h3 className="font-bold">{copy.add}</h3><p className="my-2 text-xs text-ink/60">{copy.hint}</p>
    <fieldset className="space-y-3" disabled={saving}>
      <label className="block text-sm">{copy.name}<input className={inputClass} name="username" required maxLength={100} autoComplete="off" /></label>
      <label className="block text-sm">{copy.email}<input className={inputClass} name="email" type="email" required maxLength={255} autoComplete="off" /></label>
      <label className="block text-sm">{copy.password}<input className={inputClass} name="password" type="password" required minLength={8} maxLength={128} pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])[A-Za-z0-9!@#$%^&*]+" autoComplete="new-password" /><span className="text-xs text-ink/50">{copy.passwordHint}</span></label>
      <label className="block text-sm">{copy.reason}<textarea className={inputClass} name="reason" required maxLength={500} /></label>
      {error ? <p role="alert" className="text-sm text-coral">{error}</p> : null}
      <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" onClick={onCancel}>{copy.cancel}</Button><Button type="submit">{saving ? copy.saving : copy.create}</Button></div>
    </fieldset>
  </form>;
}
