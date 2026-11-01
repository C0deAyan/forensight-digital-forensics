import { useEffect, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react';
import { FileUp, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { computeDigests } from '@/lib/hashing';
import { analyzeFileSignature } from '@/lib/fileSignatures';
import { formatBytes } from '@/lib/format';
import { getUserMessage } from '@/lib/errors';
import type { CaseRow } from '@/types/forensight';
import { Alert, Button, inputClass, labelClass } from '@/components/ui';

const MAX_FILE_BYTES = 52428800;
const MAX_SOURCE_LENGTH = 255;
const MAX_DESCRIPTION_LENGTH = 2000;

type CaseOption = { id: string; label: string };

type Props = {
  fixedCase?: CaseOption;
  onRegistered: (evidenceId: string) => void;
};

export default function UploadEvidenceForm({ fixedCase, onRegistered }: Props) {
  const { user } = useAuth();
  const [caseOptions, setCaseOptions] = useState<CaseOption[] | null>(fixedCase ? [fixedCase] : null);
  const [caseId, setCaseId] = useState(fixedCase?.id ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState('');
  const [description, setDescription] = useState('');
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (fixedCase) return;
    supabase
      .from('cases')
      .select('id, case_number, title')
      .order('created_at', { ascending: false })
      .then(({ data, error: loadError }) => {
        if (loadError) {
          getUserMessage(loadError);
          setError('Cases could not be loaded.');
          setCaseOptions([]);
          return;
        }
        const options = (data as Pick<CaseRow, 'id' | 'case_number' | 'title'>[]).map((item) => ({
          id: item.id,
          label: `${item.case_number} · ${item.title}`,
        }));
        setCaseOptions(options);
        setCaseId(options[0]?.id ?? '');
      });
  }, [fixedCase]);

  const chooseFile = (candidate: File | undefined) => {
    if (!candidate) return;
    if (candidate.size > MAX_FILE_BYTES) {
      setError(`Files must be ${formatBytes(MAX_FILE_BYTES)} or smaller.`);
      setFile(null);
      return;
    }
    setError(null);
    setFile(candidate);
  };

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => chooseFile(event.target.files?.[0]);

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    chooseFile(event.dataTransfer.files[0]);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;
    if (!caseId) {
      setError('Choose the case this evidence belongs to.');
      return;
    }
    if (!file) {
      setError('Choose a file to acquire.');
      return;
    }
    if (source.trim().length > MAX_SOURCE_LENGTH || description.trim().length > MAX_DESCRIPTION_LENGTH) {
      setError('Source or description is too long.');
      return;
    }

    setError(null);
    try {
      setProgress('Reading file bytes');
      const buffer = await file.arrayBuffer();

      setProgress('Calculating SHA-256 and SHA-512');
      const digests = await computeDigests(buffer);

      setProgress('Inspecting file signature');
      const analysis = analyzeFileSignature(file.name, new Uint8Array(buffer), file.type);

      setProgress('Storing original bytes');
      const storagePath = `${user.id}/${crypto.randomUUID()}`;
      const { error: uploadError } = await supabase.storage
        .from('evidence')
        .upload(storagePath, file, { upsert: false, contentType: 'application/octet-stream' });
      if (uploadError) throw uploadError;

      setProgress('Recording chain of custody');
      const { data, error: registerError } = await supabase.rpc('register_evidence', {
        p_case_id: caseId,
        p_original_filename: file.name.slice(0, 255),
        p_file_size: file.size,
        p_declared_mime: file.type || 'application/octet-stream',
        p_detected_format: analysis.detectedFormat,
        p_signature_status: analysis.signatureStatus,
        p_storage_path: storagePath,
        p_sha256: digests.sha256,
        p_sha512: digests.sha512,
        p_source: source.trim(),
        p_description: description.trim(),
        p_findings: analysis.findings,
      });
      if (registerError || !data) throw registerError ?? new Error('Missing evidence id');

      setProgress(null);
      onRegistered(data as string);
    } catch (cause) {
      setProgress(null);
      setError(getUserMessage(cause, 'The evidence could not be acquired. Nothing was recorded. Please try again.'));
    }
  };

  const busy = progress !== null;

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <div>
        <label htmlFor="evidence-case" className={labelClass}>Case</label>
        {fixedCase ? (
          <p className="rounded-lg border border-night-600 bg-night-900 px-3.5 py-2.5 text-sm text-slate-200">{fixedCase.label}</p>
        ) : (
          <select
            id="evidence-case"
            value={caseId}
            onChange={(event) => setCaseId(event.target.value)}
            disabled={!caseOptions || caseOptions.length === 0 || busy}
            className={inputClass}
          >
            {!caseOptions && <option value="">Loading cases</option>}
            {caseOptions?.length === 0 && <option value="">Create a case first</option>}
            {caseOptions?.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        )}
      </div>

      <div>
        <span className={labelClass}>Evidence file</span>
        <label
          htmlFor="evidence-file"
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-8 text-center transition-all duration-200 ${
            dragging ? 'border-cyan-400 bg-cyan-400/10' : 'border-night-600 bg-night-900/60 hover:border-cyan-400/50 hover:bg-night-900'
          }`}
        >
          <FileUp className="h-6 w-6 text-cyan-300" />
          {file ? (
            <>
              <span className="max-w-full truncate text-sm font-medium text-slate-100">{file.name}</span>
              <span className="text-xs text-slate-400">{formatBytes(file.size)} · original bytes are preserved unchanged</span>
            </>
          ) : (
            <>
              <span className="text-sm text-slate-200">Drop an authorized file here, or click to choose</span>
              <span className="text-xs text-slate-500">Up to {formatBytes(MAX_FILE_BYTES)}</span>
            </>
          )}
          <input id="evidence-file" type="file" className="sr-only" onChange={handleInput} disabled={busy} />
        </label>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="evidence-source" className={labelClass}>Source</label>
          <input
            id="evidence-source"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            maxLength={MAX_SOURCE_LENGTH}
            placeholder="e.g. Seized workstation, HR-07"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="evidence-description" className={labelClass}>Description</label>
          <input
            id="evidence-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={MAX_DESCRIPTION_LENGTH}
            placeholder="Short summary of the item"
            className={inputClass}
          />
        </div>
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {progress && (
        <Alert tone="info">
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            {progress}
          </span>
        </Alert>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={busy || !file || !caseId}>
          <FileUp className="h-4 w-4" />
          {busy ? 'Acquiring evidence' : 'Acquire evidence'}
        </Button>
      </div>
    </form>
  );
}
