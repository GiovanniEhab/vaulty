/** Keys used by the local (offline-first) ledger store. */
export const STORAGE_KEY = 'vaulty_state_v1';
export const BACKUP_KEY = 'vaulty_state_backup_v1';
/** Written just before an APK update so a bad release can still recover the ledger. */
export const PRE_UPDATE_BACKUP_KEY = 'vaulty_state_pre_update_v1';
