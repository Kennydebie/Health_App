import { useRef, useState } from 'react';
import { Check, Cloud, CloudOff, Download, FileCheck2, RefreshCw, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { Modal } from '../components/Modal';
import type { AppController } from '../state/useAppData';
import type { BackupPreview } from '../lib/backup';

function dateTime(value: string | null) {
  if (!value) return 'Not synchronized yet';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function dateRange(from: string | null, to: string | null) {
  if (!from || !to) return 'No dated records';
  return from === to ? from : `${from} to ${to}`;
}

export function DataMigrationModal({ controller }: { controller: AppController }) {
  const preview = controller.migrationPreview;
  const [working, setWorking] = useState(false);
  if (!preview) return null;
  const importData = async () => {
    setWorking(true);
    await controller.migrateLocalData();
    setWorking(false);
  };
  return <Modal open onClose={controller.keepLocalOnly} title="Protect your existing Project 75 data" subtitle="We found records saved in this browser. Review them before importing them into your account." size="large" closeOnBackdrop={false} footer={<><button type="button" className="text-button" onClick={controller.keepLocalOnly} disabled={working}>Not now</button><button type="button" className="primary-button" onClick={() => void importData()} disabled={working}><ShieldCheck size={17}/>{working ? 'Importing…' : 'Import all records'}</button></>}>
    <div className="migration-review">
      <div className="migration-account"><Cloud size={21}/><div><strong>{controller.account?.email ?? 'Signed-in Project 75 account'}</strong><span>Health data is stored under this account only.</span></div></div>
      <p>Nothing will be deleted from this browser. Project 75 removes known demonstration records, merges matching IDs safely, and keeps a recoverable local copy until you remove it yourself.</p>
      <div className="migration-counts">
        <span><small>Profile</small><strong>{preview.local.profileFound ? 'Found' : 'Not found'}</strong></span>
        <span><small>Nutrition entries</small><strong>{preview.local.nutritionEntries}</strong></span>
        <span><small>Workouts</small><strong>{preview.local.workouts}</strong></span>
        <span><small>Body measurements</small><strong>{preview.local.bodyMeasurements}</strong></span>
        <span><small>Date range</small><strong>{dateRange(preview.local.dateFrom, preview.local.dateTo)}</strong></span>
        <span><small>Duplicates detected</small><strong>{preview.duplicates}</strong></span>
      </div>
      {preview.conflicts ? <p className="migration-warning">{preview.conflicts} conflicting setting or record {preview.conflicts === 1 ? 'change' : 'changes'} will be merged and reported in sync status rather than silently discarded.</p> : null}
      {preview.local.fixtureRecords ? <p className="migration-note">{preview.local.fixtureRecords} known demonstration {preview.local.fixtureRecords === 1 ? 'record was' : 'records were'} excluded from this import.</p> : null}
    </div>
  </Modal>;
}

export function DataBackups({ controller }: { controller: AppController }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const exportData = () => {
    const backup = controller.exportBackup();
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `project-75-backup-${backup.exportedAt.slice(0, 10)}.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const readBackup = async (file: File) => {
    const raw = await file.text();
    setPreview(controller.previewBackup(raw));
  };
  const syncHealthy = controller.syncStatus === 'synced' || controller.syncStatus === 'conflict_resolved';

  return <>
    <article className="card settings-section data-backups" aria-labelledby="data-backups-title">
      <header><span className={`metric-icon ${syncHealthy ? 'lime' : 'blue'}`}>{syncHealthy ? <Cloud size={19}/> : <CloudOff size={19}/>}</span><div><h2 id="data-backups-title">Data & backups</h2><p>Protect your meals, measurements and workout history.</p></div></header>
      <div className={`sync-status sync-${controller.syncStatus}`} role="status" aria-live="polite"><span>{syncHealthy ? <Check size={17}/> : <RefreshCw size={17}/>}</span><div><strong>{controller.syncStatus === 'auth_required' ? 'Sign in to synchronize' : controller.syncStatus === 'migration_required' ? 'Import review required' : controller.syncStatus === 'synced' ? 'Synchronized' : controller.syncStatus === 'syncing' ? 'Synchronizing' : 'Device copy available'}</strong><p>{controller.syncMessage}</p><small>Last successful sync: {dateTime(controller.lastSuccessfulSync)}</small></div></div>
      {controller.syncStatus === 'auth_required' ? <a className="primary-button data-signin" href="/signin-with-chatgpt?return_to=/"><ShieldCheck size={17}/> Sign in with ChatGPT</a> : null}
      <div className="backup-actions">
        <button type="button" className="secondary-button" onClick={exportData}><Download size={17}/> Export all data</button>
        <button type="button" className="secondary-button" onClick={() => fileInput.current?.click()}><Upload size={17}/> Import backup</button>
        <button type="button" className="secondary-button" onClick={() => void controller.retrySync()}><RefreshCw size={17}/> Retry sync</button>
        <input ref={fileInput} hidden type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void readBackup(file); event.currentTarget.value = ''; }}/>
      </div>
      {controller.migrationBackupAvailable ? <button type="button" className="text-button local-copy-remove" onClick={() => setRemoveOpen(true)}><Trash2 size={15}/> Remove local migrated copy</button> : <p className="backup-note"><ShieldCheck size={15}/> Imports merge with existing records and never silently overwrite the full account.</p>}
    </article>

    <Modal open={Boolean(preview)} onClose={() => setPreview(null)} title="Review backup import" subtitle="No data changes until you confirm." size="large" footer={<><button type="button" className="text-button" onClick={() => setPreview(null)}>Cancel</button><button type="button" className="primary-button" disabled={!preview?.backup || Boolean(preview.invalidRecordCount)} onClick={() => { if (preview?.backup) controller.importBackup(preview.backup); setPreview(null); }}><FileCheck2 size={17}/> Merge valid records</button></>}>
      {preview ? <div className="backup-preview">
        {preview.errors.length ? <div className="form-error">{preview.errors.map((error) => <p key={error}>{error}</p>)}</div> : null}
        <div className="migration-counts"><span><small>Profile</small><strong>{preview.profileFound ? 'Found' : 'Not found'}</strong></span><span><small>Nutrition entries</small><strong>{preview.nutritionEntries}</strong></span><span><small>Workouts</small><strong>{preview.workouts}</strong></span><span><small>Body measurements</small><strong>{preview.bodyMeasurements}</strong></span><span><small>Date range</small><strong>{dateRange(preview.dateFrom, preview.dateTo)}</strong></span><span><small>Duplicates</small><strong>{preview.duplicateCount}</strong></span><span><small>Invalid records</small><strong>{preview.invalidRecordCount}</strong></span></div>
        {preview.conflictCount ? <p className="migration-warning">{preview.conflictCount} possible conflicts were found. The reviewed backup wins for matching stable IDs; unrelated account records remain intact, and the account is never replaced wholesale.</p> : null}
      </div> : null}
    </Modal>

    <Modal open={removeOpen} onClose={() => setRemoveOpen(false)} title="Remove the migrated device copy?" subtitle="Only the temporary post-migration backup on this browser will be removed." size="small" footer={<><button type="button" className="text-button" onClick={() => setRemoveOpen(false)}>Cancel</button><button type="button" className="danger-button" onClick={() => { controller.removeLocalMigrationBackup(); setRemoveOpen(false); }}><Trash2 size={16}/> Remove local copy</button></>}><p>Your synchronized account data and the active offline device copy will remain unchanged.</p></Modal>
  </>;
}
