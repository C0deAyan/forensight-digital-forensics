import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { MessageSquare, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getUserMessage } from '@/lib/errors';
import { formatUtc } from '@/lib/format';
import type { NoteRow } from '@/types/forensight';
import { Alert, Button, Card, EmptyState, Spinner, inputClass } from '@/components/ui';

const NOTE_MAX_LENGTH = 5000;

export default function CaseNotesCard({ caseId }: { caseId: string }) {
  const [notes, setNotes] = useState<NoteRow[] | null>(null);
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from('investigation_notes')
      .select('id, case_id, body, created_at')
      .eq('case_id', caseId)
      .order('created_at', { ascending: false });
    if (loadError) {
      getUserMessage(loadError);
      setError('Notes could not be loaded.');
      return;
    }
    setNotes(data as NoteRow[]);
  }, [caseId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || trimmed.length > NOTE_MAX_LENGTH) {
      setError(`Notes must be between 1 and ${NOTE_MAX_LENGTH} characters.`);
      return;
    }
    setSaving(true);
    setError(null);
    const { error: insertError } = await supabase.from('investigation_notes').insert({ case_id: caseId, body: trimmed });
    setSaving(false);
    if (insertError) {
      setError(getUserMessage(insertError, 'The note could not be saved. Please try again.'));
      return;
    }
    setBody('');
    load();
  };

  const handleDelete = async (id: string) => {
    const { error: deleteError } = await supabase.from('investigation_notes').delete().eq('id', id);
    if (deleteError) {
      setError(getUserMessage(deleteError, 'The note could not be deleted.'));
      return;
    }
    load();
  };

  return (
    <Card title="Investigation notes" subtitle="Analyst observations, timeline entries, and review comments.">
      <form onSubmit={handleAdd} className="mb-6 space-y-3" noValidate>
        <label htmlFor="note-body" className="sr-only">New note</label>
        <textarea
          id="note-body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={3}
          maxLength={NOTE_MAX_LENGTH + 1}
          placeholder="Add an investigation note"
          className={inputClass}
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-slate-500">{body.trim().length} / {NOTE_MAX_LENGTH}</span>
          <Button type="submit" disabled={saving || !body.trim()}>
            <MessageSquare className="h-4 w-4" />
            {saving ? 'Saving' : 'Add note'}
          </Button>
        </div>
      </form>

      {error && <div className="mb-4"><Alert tone="error">{error}</Alert></div>}
      {!notes && !error && <Spinner label="Loading notes" />}
      {notes && notes.length === 0 && (
        <EmptyState icon={<MessageSquare className="h-5 w-5" />} title="No notes yet" description="Notes are timestamped and saved to this case." />
      )}
      {notes && notes.length > 0 && (
        <ul className="space-y-3">
          {notes.map((note) => (
            <li key={note.id} className="rounded-lg border border-night-700 bg-night-900/60 p-4 transition hover:border-night-600">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">{note.body}</p>
              <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                <span>{formatUtc(note.created_at)}</span>
                <button
                  type="button"
                  onClick={() => handleDelete(note.id)}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 transition hover:bg-rose-500/10 hover:text-rose-300"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
