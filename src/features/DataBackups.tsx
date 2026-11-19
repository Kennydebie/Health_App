import { useRef, useState } from 'react';
import { Check, Cloud, CloudOff, Download, FileCheck2, RefreshCw, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { Modal } from '../components/Modal';
import type { AppController } from '../state/useAppData';
import type { BackupPreview } from '../lib/backup';

function dateTime(value: string | null) {
  if (!value) return 'Nog niet gesynchroniseerd';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function dateRange(from: string | null, to: string | null) {
  if (!from || !to) return 'Geen gedateerde records';
  return from === to ? from : `${from} t/m ${to}`;
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
  return <Modal open onClose={controller.keepLocalOnly} title="Bewaar je bestaande gegevens" subtitle="We vonden gegevens in deze browser. Bekijk ze voordat je ze in je account zet." size="large" closeOnBackdrop={false} footer={<><button type="button" className="text-button" onClick={controller.keepLocalOnly} disabled={working}>Niet nu</button><button type="button" className="primary-button" onClick={() => void importData()} disabled={working}><ShieldCheck size={17}/>{working ? 'Importing…' : 'Alles importeren'}</button></>}>
    <div className="migration-review">
      <div className="migration-account"><Cloud size={21}/><div><strong>{controller.account?.email ?? 'Ingelogd Project 73-account'}</strong><span>Gezondheidsgegevens worden alleen onder dit account opgeslagen.</span></div></div>
      <p>Er wordt niets uit deze browser verwijderd. Project 73 verwijdert bekende voorbeeldgegevens, voegt overeenkomende records veilig samen en bewaart een herstelbare kopie op dit apparaat tot je die zelf verwijdert.</p>
      <div className="migration-counts">
        <span><small>Profile</small><strong>{preview.local.profileFound ? 'Gevonden' : 'Niet gevonden'}</strong></span>
        <span><small>Voedingsregels</small><strong>{preview.local.nutritionEntries}</strong></span>
        <span><small>Workouts</small><strong>{preview.local.workouts}</strong></span>
        <span><small>Lichaamsmetingen</small><strong>{preview.local.bodyMeasurements}</strong></span>
        <span><small>Periode</small><strong>{dateRange(preview.local.dateFrom, preview.local.dateTo)}</strong></span>
        <span><small>Dubbele records</small><strong>{preview.duplicates}</strong></span>
      </div>
      {preview.conflicts ? <p className="migration-warning">{preview.conflicts} conflicting setting or record {preview.conflicts === 1 ? 'change' : 'changes'} will be merged and reported in sync status rather than silently discarded.</p> : null}
      {preview.local.fixtureRecords ? <p className="migration-note">{preview.local.fixtureRecords} known demonstration {preview.local.fixtureRecords === 1 ? 'record is' : 'records zijn'} excluded from this import.</p> : null}
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
    anchor.download = `project-73-backup-${backup.exportedAt.slice(0, 10)}.json`;
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
      <header><span className={`metric-icon ${syncHealthy ? 'lime' : 'blue'}`}>{syncHealthy ? <Cloud size={19}/> : <CloudOff size={19}/>}</span><div><h2 id="data-backups-title">Gegevens & back-ups</h2><p>Bescherm je maaltijden, metingen en trainingsgeschiedenis.</p></div></header>
      <div className={`sync-status sync-${controller.syncStatus}`} role="status" aria-live="polite"><span>{syncHealthy ? <Check size={17}/> : <RefreshCw size={17}/>}</span><div><strong>{controller.syncStatus === 'auth_required' ? 'Log in om te synchroniseren' : controller.syncStatus === 'migration_required' ? 'Import controleren' : controller.syncStatus === 'synced' ? 'Gesynchroniseerd' : controller.syncStatus === 'syncing' ? 'Synchroniseren' : 'Kopie op apparaat'}</strong><p>{controller.syncMessage}</p><small>Last successful sync: {dateTime(controller.lastSuccessfulSync)}</small></div></div>
      {controller.syncStatus === 'auth_required' ? <a className="primary-button data-signin" href="/signin-with-chatgpt?return_to=/"><ShieldCheck size={17}/> Inloggen met ChatGPT</a> : null}
      <div className="backup-actions">
        <button type="button" className="secondary-button" onClick={exportData}><Download size={17}/> Alles exporteren</button>
        <button type="button" className="secondary-button" onClick={() => fileInput.current?.click()}><Upload size={17}/> Back-up importeren</button>
        <button type="button" className="secondary-button" onClick={() => void controller.retrySync()}><RefreshCw size={17}/> Opnieuw synchroniseren</button>
        <input ref={fileInput} hidden type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void readBackup(file); event.currentTarget.value = ''; }}/>
      </div>
      {controller.migrationBackupAvailable ? <button type="button" className="text-button local-copy-remove" onClick={() => setRemoveOpen(true)}><Trash2 size={15}/> Lokale kopie verwijderen</button> : <p className="backup-note"><ShieldCheck size={15}/> Importeren voegt samen met bestaande gegevens en overschrijft nooit ongemerkt je hele account.</p>}
    </article>

    <Modal open={Boolean(preview)} onClose={() => setPreview(null)} title="Back-up controleren" subtitle="Er verandert niets tot je bevestigt." size="large" footer={<><button type="button" className="text-button" onClick={() => setPreview(null)}>Cancel</button><button type="button" className="primary-button" disabled={!preview?.backup || Boolean(preview.invalidRecordCount)} onClick={() => { if (preview?.backup) controller.importBackup(preview.backup); setPreview(null); }}><FileCheck2 size={17}/> Geldige records samenvoegen</button></>}>
      {preview ? <div className="backup-preview">
        {preview.errors.length ? <div className="form-error">{preview.errors.map((error) => <p key={error}>{error}</p>)}</div> : null}
        <div className="migration-counts"><span><small>Profile</small><strong>{preview.profileFound ? 'Gevonden' : 'Niet gevonden'}</strong></span><span><small>Voedingsregels</small><strong>{preview.nutritionEntries}</strong></span><span><small>Workouts</small><strong>{preview.workouts}</strong></span><span><small>Lichaamsmetingen</small><strong>{preview.bodyMeasurements}</strong></span><span><small>Periode</small><strong>{dateRange(preview.dateFrom, preview.dateTo)}</strong></span><span><small>Duplicates</small><strong>{preview.duplicateCount}</strong></span><span><small>Ongeldige records</small><strong>{preview.invalidRecordCount}</strong></span></div>
        {preview.conflictCount ? <p className="migration-warning">{preview.conflictCount} possible conflicts were found. The reviewed backup wins for matching stable IDs; unrelated account records remain intact, and the account is never replaced wholesale.</p> : null}
      </div> : null}
    </Modal>

    <Modal open={removeOpen} onClose={() => setRemoveOpen(false)} title="Kopie op dit apparaat verwijderen?" subtitle="Alleen de tijdelijke reservekopie in deze browser wordt verwijderd." size="small" footer={<><button type="button" className="text-button" onClick={() => setRemoveOpen(false)}>Cancel</button><button type="button" className="danger-button" onClick={() => { controller.removeLocalMigrationBackup(); setRemoveOpen(false); }}><Trash2 size={16}/> Lokale kopie verwijderen</button></>}><p>Je gesynchroniseerde accountgegevens en de actieve kopie op dit apparaat blijven ongewijzigd.</p></Modal>
  </>;
}
