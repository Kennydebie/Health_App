import { useEffect, useMemo, useState } from 'react';
import { Camera, ImagePlus, LoaderCircle, LockKeyhole, Scale, ShieldCheck, Trash2 } from 'lucide-react';
import { Modal } from '../components/Modal';
import { prettyDate, toDateKey } from '../lib/date';
import type { ProgressPhoto } from '../types/models';

interface PhotoResponse { photos?: ProgressPhoto[]; photo?: ProgressPhoto; code?: string }

export function ProgressPhotos() {
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [pose, setPose] = useState<ProgressPhoto['pose']>('front');
  const [date, setDate] = useState(toDateKey());
  const [weight, setWeight] = useState('');
  const [note, setNote] = useState('');
  const [compareA, setCompareA] = useState('');
  const [compareB, setCompareB] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/progress-photos', { credentials: 'same-origin' }).then(async (response) => {
      const body = await response.json() as PhotoResponse;
      if (!response.ok) throw new Error(body.code === 'auth_required' ? 'Sign in to use private progress photos.' : 'Photo storage is unavailable right now.');
      if (!cancelled) setPhotos(body.photos ?? []);
    }).catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not load photos.'); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const resolvedCompareA = compareA || photos.at(-1)?.id || '';
  const resolvedCompareB = compareB || photos[0]?.id || '';
  const first = useMemo(() => photos.find((photo) => photo.id === resolvedCompareA) ?? null, [photos, resolvedCompareA]);
  const second = useMemo(() => photos.find((photo) => photo.id === resolvedCompareB) ?? null, [photos, resolvedCompareB]);

  const upload = async () => {
    if (!file) return;
    setUploading(true); setError('');
    const form = new FormData();
    form.append('photo', file); form.append('pose', pose); form.append('date', date); form.append('bodyWeightKg', weight); form.append('note', note);
    try {
      const response = await fetch('/api/progress-photos', { method: 'POST', body: form, credentials: 'same-origin' });
      const body = await response.json() as PhotoResponse;
      if (!response.ok || !body.photo) throw new Error(body.code === 'image_too_large' ? 'Choose an image smaller than 8 MB.' : 'The photo could not be saved.');
      setPhotos((current) => [body.photo!, ...current]); setOpen(false); setFile(null); setNote(''); setWeight('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The photo could not be saved.'); }
    finally { setUploading(false); }
  };

  const remove = async (photo: ProgressPhoto) => {
    if (!window.confirm(`Delete the ${prettyDate(photo.date)} ${photo.pose} photo? This cannot be undone.`)) return;
    const response = await fetch(`/api/progress-photos/${encodeURIComponent(photo.id)}`, { method: 'DELETE', credentials: 'same-origin' });
    if (response.ok) setPhotos((current) => current.filter((item) => item.id !== photo.id));
    else setError('The photo could not be deleted.');
  };

  return <section className="progress-photos card">
    <header><div><p className="eyebrow">Private visual record</p><h2>Progress photos</h2><p>Use consistent lighting, distance, clothing, and pose. Compare weeks—not day-to-day fluctuations.</p></div><button type="button" className="secondary-button" onClick={() => setOpen(true)}><ImagePlus size={17} /> Add photo</button></header>
    <div className="photo-privacy"><LockKeyhole size={15} /><span>Photos are stored privately and are only returned to the signed-in account.</span></div>
    {loading ? <div className="photo-loading"><LoaderCircle className="spin" size={22} /> Loading private photos…</div> : null}
    {!loading && !photos.length ? <div className="empty-state"><Camera size={29} /><h3>Create a consistent visual baseline</h3><p>Add front, side, or back photos. The app stores the original privately; it never estimates body fat from the image.</p></div> : null}
    {photos.length ? <>
      <div className="photo-compare-controls"><label>Earlier<select value={resolvedCompareA} onChange={(event) => setCompareA(event.target.value)}>{photos.map((photo) => <option key={photo.id} value={photo.id}>{prettyDate(photo.date)} · {photo.pose}</option>)}</select></label><label>Later<select value={resolvedCompareB} onChange={(event) => setCompareB(event.target.value)}>{photos.map((photo) => <option key={photo.id} value={photo.id}>{prettyDate(photo.date)} · {photo.pose}</option>)}</select></label></div>
      <div className="photo-comparison">{[first, second].map((photo, index) => photo ? <figure key={`${index}-${photo.id}`}><img src={photo.imageUrl} alt={`${photo.pose} progress on ${prettyDate(photo.date)}`} loading="lazy" /><figcaption><strong>{prettyDate(photo.date)}</strong><span>{photo.pose}{photo.bodyWeightKg ? ` · ${photo.bodyWeightKg} kg` : ''}</span>{photo.note ? <small>{photo.note}</small> : null}<button type="button" className="danger" onClick={() => void remove(photo)} aria-label={`Delete ${prettyDate(photo.date)} photo`}><Trash2 size={14} /></button></figcaption></figure> : <div className="photo-placeholder" key={index}><Camera size={25} /></div>)}</div>
    </> : null}
    {error ? <p className="form-error">{error}</p> : null}

    <Modal open={open} onClose={() => setOpen(false)} title="Add a private progress photo" subtitle="Use a consistent pose and environment for an honest comparison." footer={<><button type="button" className="secondary-button" onClick={() => setOpen(false)}>Cancel</button><button type="button" className="primary-button" disabled={!file || uploading} onClick={() => void upload()}>{uploading ? <LoaderCircle className="spin" size={17} /> : <ShieldCheck size={17} />} Save privately</button></>}>
      <div className="progress-photo-form"><label className="photo-file"><ImagePlus size={24} /><span>{file ? file.name : 'Choose JPEG, PNG, or WebP (max 8 MB)'}</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label><div><label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><label>Pose<select value={pose} onChange={(event) => setPose(event.target.value as ProgressPhoto['pose'])}><option value="front">Front</option><option value="side">Side</option><option value="back">Back</option></select></label></div><label>Body weight (optional)<span className="unit-input"><input type="number" min="30" max="300" step="0.1" value={weight} onChange={(event) => setWeight(event.target.value)} /><span>kg</span></span></label><label>Note (optional)<textarea maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Lighting, clothing, training phase…" /></label><p><Scale size={15} /> The image is for visual comparison only. Body-composition estimates still come from measurements you explicitly log.</p></div>
    </Modal>
  </section>;
}
