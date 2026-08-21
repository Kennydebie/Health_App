import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Camera, Check, ChevronDown, ImagePlus, LoaderCircle, LockKeyhole, PencilLine, RefreshCw, ScanLine, ShieldCheck, Sparkles, UploadCloud, X } from 'lucide-react';
import { Modal } from '../components/Modal';
import { EMPTY_BODY_MEASUREMENT_CONFIDENCE, FITDAYS_FIELDS, findSimilarBodyMeasurement, formatMeasurementTimestamp, parseMeasurementNumber, validateFitDaysMeasurement } from '../lib/fitdays';
import { formatMeasurementDate, latestMeasurement } from '../lib/bodyMeasurements';
import type { AppController } from '../state/useAppData';
import type { BodyMeasurementDraft, BodyMetricKey } from '../types/models';

interface FitDaysImportProps { controller: AppController; }
type ImportStep = 'idle' | 'analyzing' | 'review' | 'error' | 'success';

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif']);

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('The image could not be read.'));
    reader.onerror = () => reject(new Error('The image could not be read.'));
    reader.readAsDataURL(file);
  });
}

async function convertHeicToJpeg(file: File) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error();
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', .94));
    if (!blob) throw new Error();
    return new File([blob], file.name.replace(/\.hei[cf]$/i, '.jpg'), { type: 'image/jpeg' });
  } catch {
    throw new Error('HEIC is not supported by this browser. Export the screenshot as PNG or JPEG and try again.');
  }
}

function inputTimestamp(timestamp: string | null) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function friendlyAnalysisError(status: number, code?: string) {
  if (status === 429) return 'You have reached the screenshot-analysis limit for now. Please try again later.';
  if (status === 413) return 'That image is too large. Choose a screenshot under 12 MB.';
  if (status === 415) return 'This image format is not supported here. Try PNG, JPEG, or WebP.';
  if (code === 'ai_unavailable') return 'Screenshot analysis is temporarily unavailable. Try again or enter your weight manually.';
  if (code === 'image_unreadable') return 'The screenshot could not be interpreted. Try a sharper image with the full FitDays result visible.';
  return 'We could not analyze this screenshot. Please retry with a clearer image.';
}

export function FitDaysImport({ controller }: FitDaysImportProps) {
  const { data, saveBodyMeasurement } = controller;
  const galleryInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const previewUrl = useRef<string | null>(null);
  const [step, setStep] = useState<ImportStep>('idle');
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [draft, setDraft] = useState<BodyMeasurementDraft | null>(null);
  const [error, setError] = useState('');
  const [duplicateId, setDuplicateId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [detectedDate, setDetectedDate] = useState<string | null>(null);
  const [dateChoice, setDateChoice] = useState<'screenshot' | 'today'>('screenshot');
  const [savedHistorical, setSavedHistorical] = useState(false);

  const clearPreview = () => {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null;
    setPreview(null);
  };

  useEffect(() => () => {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
  }, []);

  const reset = () => {
    clearPreview();
    setStep('idle');
    setDraft(null);
    setError('');
    setFileName('');
    setDuplicateId(null);
    setDetectedDate(null);
    setDateChoice('screenshot');
    setSavedHistorical(false);
    if (galleryInput.current) galleryInput.current.value = '';
    if (cameraInput.current) cameraInput.current.value = '';
  };

  const analyzeFile = async (sourceFile: File) => {
    setError('');
    const extension = sourceFile.name.split('.').pop()?.toLowerCase();
    const inferredType = sourceFile.type || (extension === 'heic' ? 'image/heic' : extension === 'heif' ? 'image/heif' : '');
    if (!ACCEPTED_TYPES.has(inferredType)) {
      setStep('error');
      setError('Choose a PNG, JPEG, WebP, or supported HEIC screenshot.');
      return;
    }
    if (sourceFile.size > MAX_IMAGE_BYTES) {
      setStep('error');
      setError('That image is too large. Choose a screenshot under 12 MB.');
      return;
    }

    clearPreview();
    previewUrl.current = URL.createObjectURL(sourceFile);
    setPreview(previewUrl.current);
    setFileName(sourceFile.name);
    setStep('analyzing');

    try {
      const file = inferredType === 'image/heic' || inferredType === 'image/heif' ? await convertHeicToJpeg(sourceFile) : sourceFile;
      const image = await readAsDataUrl(file);
      const sessionResponse = await fetch('/api/fitdays/session', { cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!sessionResponse.ok) throw Object.assign(new Error(), { status: sessionResponse.status, code: 'ai_unavailable' });
      const session = await sessionResponse.json() as { token?: string };
      if (!session.token) throw Object.assign(new Error(), { status: 503, code: 'ai_unavailable' });
      const response = await fetch('/api/fitdays/analyze', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'X-FitDays-Session': session.token },
        body: JSON.stringify({ image }),
      });
      const result = await response.json().catch(() => ({})) as { measurement?: BodyMeasurementDraft; code?: string };
      if (!response.ok || !result.measurement) throw Object.assign(new Error(), { status: response.status, code: result.code });
      setDraft(result.measurement);
      setDetectedDate(result.measurement.measuredAt);
      setDateChoice('screenshot');
      setStep('review');
    } catch (caught) {
      const failure = caught as { status?: number; code?: string; message?: string };
      setStep('error');
      setError(failure.message?.startsWith('HEIC ') ? failure.message : friendlyAnalysisError(failure.status ?? 500, failure.code));
    }
  };

  const issuesByField = useMemo(() => {
    const result = new Map<string, BodyMeasurementDraft['issues']>();
    for (const issue of draft?.issues ?? []) {
      const key = issue.field ?? 'general';
      result.set(key, [...(result.get(key) ?? []), issue]);
    }
    return result;
  }, [draft]);

  const updateMetric = (key: BodyMetricKey, raw: string) => setDraft((current) => {
    if (!current) return current;
    const next = { ...current, [key]: parseMeasurementNumber(raw) };
    return { ...next, issues: validateFitDaysMeasurement(next, next.confidence ?? EMPTY_BODY_MEASUREMENT_CONFIDENCE) };
  });

  const updateTimestamp = (raw: string) => setDraft((current) => {
    if (!current) return current;
    const next = { ...current, measuredAt: raw ? new Date(raw).toISOString() : null };
    return { ...next, issues: validateFitDaysMeasurement(next, next.confidence ?? EMPTY_BODY_MEASUREMENT_CONFIDENCE) };
  });

  const chooseDate = (choice: 'screenshot' | 'today') => {
    setDateChoice(choice);
    updateTimestamp(choice === 'today' ? new Date().toISOString() : detectedDate ?? '');
  };

  const completeSave = (replaceId?: string) => {
    if (!draft) return;
    const latestBeforeSave = latestMeasurement(data.measurements);
    setSavedHistorical(Boolean(draft.measuredAt && latestBeforeSave?.measuredAt && draft.measuredAt < latestBeforeSave.measuredAt));
    saveBodyMeasurement(draft, replaceId);
    clearPreview();
    setDuplicateId(null);
    setStep('success');
    setDraft(null);
    setFileName('');
  };

  const requestSave = () => {
    if (!draft) return;
    const duplicate = findSimilarBodyMeasurement(data.measurements, draft);
    if (duplicate) setDuplicateId(duplicate.id);
    else completeSave();
  };

  const useManualEntry = () => {
    reset();
    window.requestAnimationFrame(() => document.querySelector<HTMLInputElement>('.weight-entry input[type="number"]')?.focus());
  };

  const duplicate = data.measurements.find((measurement) => measurement.id === duplicateId);
  const importedCount = FITDAYS_FIELDS.filter((field) => draft?.[field.key] != null).length + Number(Boolean(draft?.measuredAt));
  const confidence = draft?.confidence ?? EMPTY_BODY_MEASUREMENT_CONFIDENCE;
  const latest = latestMeasurement(data.measurements);
  const historical = Boolean(draft?.measuredAt && latest?.measuredAt && draft.measuredAt < latest.measuredAt && duplicate?.id !== latest.id);

  return <section className={`fitdays-module card fitdays-${step}`} aria-labelledby="fitdays-title">
    <div className="fitdays-heading">
      <div className="fitdays-mark"><ScanLine size={24} /><Sparkles size={13} /></div>
      <div><h2 id="fitdays-title">FitDays Import</h2><p>Upload a FitDays screenshot to add your body measurements.</p></div>
      {step !== 'idle' && step !== 'success' ? <button type="button" className="fitdays-reset" onClick={reset}><X size={16} /> Start over</button> : null}
    </div>

    {step === 'idle' ? <div className="fitdays-start">
      <div className={`fitdays-dropzone ${dragging ? 'dragging' : ''}`}
        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false); }}
        onDrop={(event) => { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files[0]; if (file) void analyzeFile(file); }}>
        <UploadCloud size={31} /><strong>Drop your FitDays screenshot here</strong><span>PNG, JPEG, WebP · HEIC when your browser supports it · max 12 MB</span>
      </div>
      <div className="fitdays-actions">
        <button type="button" className="primary-button" onClick={() => galleryInput.current?.click()}><ImagePlus size={18} /> Import screenshot</button>
        <button type="button" className="secondary-button" onClick={() => cameraInput.current?.click()}><Camera size={18} /> Take a photo</button>
      </div>
      <input ref={galleryInput} hidden type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif" onChange={(event) => { const file = event.target.files?.[0]; if (file) void analyzeFile(file); }} />
      <input ref={cameraInput} hidden type="file" accept="image/*" capture="environment" onChange={(event) => { const file = event.target.files?.[0]; if (file) void analyzeFile(file); }} />
      <p className="fitdays-privacy"><LockKeyhole size={14} /> The screenshot is analyzed securely and is not stored.</p>
    </div> : null}

    {step === 'analyzing' ? <div className="fitdays-processing">
      <div className="fitdays-preview">{preview ? <img src={preview} alt="FitDays screenshot awaiting analysis" /> : null}<span><ScanLine size={26} /></span></div>
      <div><LoaderCircle className="spin" size={28} /><h3>Analyzing screenshot</h3><p>Reading Dutch or English labels and checking that the values are within expected ranges.</p><div className="analysis-steps"><span className="active">Upload received</span><span className="active">Reading measurements</span><span>Checking values</span></div></div>
    </div> : null}

    {step === 'error' ? <div className="fitdays-error-state">
      <span><AlertCircle size={26} /></span><div><h3>Screenshot could not be read</h3><p>{error}</p><div><button type="button" className="primary-button" onClick={() => galleryInput.current?.click()}><RefreshCw size={17} /> Try another screenshot</button><button type="button" className="text-button" onClick={useManualEntry}><PencilLine size={16} /> Enter weight manually</button></div></div>
      <input ref={galleryInput} hidden type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif" onChange={(event) => { const file = event.target.files?.[0]; if (file) void analyzeFile(file); }} />
    </div> : null}

    {step === 'review' && draft ? <div className="fitdays-review">
      <div className="fitdays-review-summary">
        <div className="fitdays-thumb">{preview ? <img src={preview} alt="Uploaded FitDays screenshot" /> : null}</div>
        <div><h3>Review import</h3><p>{importedCount} values found in {fileName}. Nothing is saved until you confirm.</p></div>
        <span className="fitdays-ai-badge"><ShieldCheck size={16} /> Extracted</span>
      </div>

      <div className="fitdays-date-review">
        <div><p className="eyebrow">Measurement date</p><strong>{formatMeasurementDate(draft.measuredAt)}</strong><span>{confidence.measuredAt == null ? 'Please verify the date' : `${Math.round(confidence.measuredAt * 100)}% extraction confidence`}</span></div>
        <div className="fitdays-date-choices" role="group" aria-label="Choose measurement date source">
          <button type="button" className={dateChoice === 'screenshot' ? 'active' : ''} disabled={!detectedDate} onClick={() => chooseDate('screenshot')}><Check size={15} /> Keep screenshot date</button>
          <button type="button" className={dateChoice === 'today' ? 'active' : ''} onClick={() => chooseDate('today')}>Use today as measurement date</button>
        </div>
      </div>
      <div className="fitdays-timestamp">
        <label><span>Edit date and time</span><input type="datetime-local" value={inputTimestamp(draft.measuredAt)} onChange={(event) => { setDateChoice('screenshot'); updateTimestamp(event.target.value); }} /></label>
        {issuesByField.get('measuredAt')?.map((issue) => <small className={issue.code} key={issue.message}><AlertCircle size={13} /> {issue.message}</small>)}
      </div>

      {historical ? <div className="fitdays-historical-note"><AlertCircle size={18} /><p><strong>This is a historical measurement.</strong>This measurement is from {formatMeasurementDate(draft.measuredAt, false)}. It will be added to your history but will not replace your current weight.</p></div> : null}

      <button type="button" className="fitdays-detail-toggle" aria-expanded={detailsOpen} onClick={() => setDetailsOpen((open) => !open)}><span><strong>Extracted measurements</strong><small>Edit any value inline before saving</small></span><ChevronDown size={18} /></button>
      {detailsOpen ? <div className="fitdays-fields">{(['Core', 'Composition', 'Hydration', 'Metabolism'] as const).map((group) => <section key={group}><h4>{group}</h4><div>{FITDAYS_FIELDS.filter((field) => field.group === group).map((field) => {
        const fieldIssues = issuesByField.get(field.key) ?? [];
        const fieldConfidence = confidence[field.key];
        return <label className={fieldIssues.length ? `has-issue ${fieldIssues.some((issue) => issue.severity === 'warning') ? 'warning' : 'missing'}` : ''} key={field.key}>
          <span>{field.label}<em>{fieldConfidence == null ? 'Not read' : fieldConfidence < .75 ? 'Check' : `${Math.round(fieldConfidence * 100)}% sure`}</em></span>
          <div><input type="number" inputMode="decimal" step={field.step} min={field.min} max={field.max} value={draft[field.key] ?? ''} placeholder="—" onChange={(event) => updateMetric(field.key, event.target.value)} /><i>{field.unit}</i></div>
          {fieldIssues[0] ? <small><AlertCircle size={12} /> {fieldIssues[0].message}</small> : null}
        </label>;
      })}</div></section>)}</div> : null}

      {(draft.issues ?? []).some((issue) => issue.code === 'inconsistent') ? <div className="fitdays-consistency"><AlertCircle size={18} /><p><strong>A few values do not fully agree.</strong>The screenshot values are left unchanged so you can compare them yourself.</p></div> : null}
      <div className="fitdays-save"><p><ShieldCheck size={16} /> Optional values can stay empty. FitDays classifications and “ideal weight” are not imported.</p><button type="button" className="primary-button" disabled={!draft.measuredAt} onClick={requestSave}><Check size={18} /> Save measurement</button></div>
    </div> : null}

    {step === 'success' ? <div className="fitdays-success"><span><Check size={30} /></span><h3>Measurement saved</h3><p>{savedHistorical ? 'The measurement was added to history. Your newer current weight was not changed.' : 'The body summary, charts and measurement history have been updated.'}</p><button type="button" className="secondary-button" onClick={reset}><ImagePlus size={17} /> Import another screenshot</button></div> : null}

    <Modal open={Boolean(duplicate)} onClose={() => setDuplicateId(null)} title="Possible duplicate measurement" subtitle="A saved entry has a similar time and weight." size="small">
      {duplicate ? <div className="duplicate-review"><p><strong>{formatMeasurementTimestamp(duplicate.measuredAt)}</strong><span>{duplicate.weightKg == null ? 'Weight not available' : `${duplicate.weightKg} kg`}</span></p><div><button type="button" className="primary-button" onClick={() => completeSave(duplicate.id)}>Replace existing entry</button><button type="button" className="secondary-button" onClick={() => completeSave()}>Keep both entries</button><button type="button" className="text-button" onClick={reset}>Cancel import</button></div></div> : null}
    </Modal>
  </section>;
}
