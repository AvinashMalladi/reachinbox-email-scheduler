import { useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import { FileUp, Users } from 'lucide-react';
import { apiPost, ApiError } from '../lib/api';
import { useToast } from '../lib/toast';
import type { ScheduleResponse } from '../types/api';
import { Button, Field, Input, Modal, Textarea } from './ui';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Props = {
  open: boolean;
  onClose: () => void;
  onScheduled: () => void;
};

type FormState = {
  subject: string;
  body: string;
  startTime: string;
  delayBetweenSeconds: number;
  hourlyLimit: number | null;
};

function initialForm(): FormState {
  const inTenMinutes = new Date(Date.now() + 10 * 60 * 1000 - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
  return { subject: '', body: '', startTime: inTenMinutes, delayBetweenSeconds: 2, hourlyLimit: null };
}

export function ComposeModal({ open, onClose, onScheduled }: Props) {
  const [form, setForm] = useState<FormState>(initialForm);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileEmails, setFileEmails] = useState<string[]>([]);
  const [manualEmails, setManualEmails] = useState('');
  const [invalidCount, setInvalidCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { push } = useToast();

  const emails = useMemo(() => {
    const manual = manualEmails
      .split(/[\n,;]+/)
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean);
    return [...new Set([...manual, ...fileEmails])];
  }, [manualEmails, fileEmails]);

  const reset = () => {
    setForm(initialForm());
    setFileName(null);
    setFileEmails([]);
    setManualEmails('');
    setInvalidCount(0);
    setError(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const close = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const handleFile = (file: File) => {
    setFileName(file.name);
    Papa.parse<Record<string, string>>(file, {
      skipEmptyLines: true,
      complete: (results) => {
        const raw = results.data
          .map((row) => Object.values(row)[0] ?? '')
          .map((v) => v.trim().toLowerCase().replace(/^["']|["']$/g, ''));
        const valid = raw.filter((v) => EMAIL_REGEX.test(v));
        const invalid = raw.filter((v) => v && !EMAIL_REGEX.test(v)).length;
        setFileEmails([...new Set(valid)]);
        setInvalidCount(invalid);
      },
      error: () => {
        push('Could not parse file', 'error');
      },
    });
  };

  const preview = useMemo(() => emails.slice(0, 5), [emails]);

  const canSubmit =
    form.subject.trim().length > 0 &&
    form.body.trim().length > 0 &&
    emails.length > 0 &&
    form.startTime.length > 0 &&
    !submitting;

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const scheduledAt = new Date(form.startTime).toISOString();
      const res = await apiPost<ScheduleResponse>('/api/emails/schedule', {
        subject: form.subject.trim(),
        body: form.body.trim(),
        recipients: emails,
        scheduledAt,
        delayBetweenMs: Math.max(0, form.delayBetweenSeconds) * 1000,
        hourlyLimit: form.hourlyLimit,
      });
      push(`Scheduled ${res.count} email${res.count === 1 ? '' : 's'}`, 'success');
      reset();
      onScheduled();
      onClose();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to schedule emails';
      setError(message);
      push(message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title="Compose New Email" wide>
      <div className="space-y-4">
        <Field label="Subject">
          <Input
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
            placeholder="Quick question about your workflow"
          />
        </Field>

        <Field label="Body">
          <Textarea
            rows={6}
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            placeholder={'Hi {{name}},\n\n…'}
          />
        </Field>

        <Field
          label="Recipients (manual)"
          hint="Type email addresses separated by commas or new lines — no file needed."
        >
          <Input
            value={manualEmails}
            onChange={(e) => setManualEmails(e.target.value)}
            placeholder="alice@example.com, bob@example.com"
          />
        </Field>

        <Field label="or import from file (CSV / TXT)" hint="One email per line, or first column of a CSV.">
          <div className="flex items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
            <Button variant="secondary" type="button" onClick={() => fileRef.current?.click()}>
              <FileUp className="h-4 w-4" />
              Upload file
            </Button>
            <span className="truncate text-sm text-slate-500">{fileName ?? 'No file selected'}</span>
          </div>
        </Field>

        {emails.length > 0 && (
          <div className="rounded-lg bg-brand-50 px-4 py-3 ring-1 ring-brand-100">
            <div className="flex items-center gap-2 text-sm font-medium text-brand-700">
              <Users className="h-4 w-4" />
              {emails.length} email{emails.length === 1 ? '' : 's'} detected
              {invalidCount > 0 && (
                <span className="font-normal text-amber-600">({invalidCount} invalid row(s) skipped)</span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {preview.map((email) => (
                <span key={email} className="rounded bg-white px-2 py-0.5 text-xs text-slate-600 ring-1 ring-brand-100">
                  {email}
                </span>
              ))}
              {emails.length > preview.length && (
                <span className="px-1 py-0.5 text-xs text-slate-500">+{emails.length - preview.length} more</span>
              )}
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Start time">
            <Input
              type="datetime-local"
              value={form.startTime}
              onChange={(e) => setForm({ ...form, startTime: e.target.value })}
            />
          </Field>
          <Field label="Delay between emails (s)">
            <Input
              type="number"
              min={0}
              value={form.delayBetweenSeconds}
              onChange={(e) => setForm({ ...form, delayBetweenSeconds: Number(e.target.value) })}
            />
          </Field>
          <Field label="Hourly limit" hint="Per sender, optional">
            <Input
              type="number"
              min={1}
              placeholder="server default"
              value={form.hourlyLimit ?? ''}
              onChange={(e) =>
                setForm({
                  ...form,
                  hourlyLimit: e.target.value === '' ? null : Math.max(1, Number(e.target.value)),
                })
              }
            />
          </Field>
        </div>

        {error && (
          <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">{error}</div>
        )}

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
          <Button variant="secondary" onClick={close} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit} loading={submitting}>
            Schedule
          </Button>
        </div>
      </div>
    </Modal>
  );
}