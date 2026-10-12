import { dismissToast, useToast } from '../lib/toast';

/** Message en bas d'écran, avec « Annuler » quand l'action peut être défaite. */
export function ToastHost() {
  const t = useToast();
  if (!t) return null;
  return (
    <div className="toast toast-undo" role="status" key={t.id}>
      <span className="grow">{t.message}</span>
      {t.undo && (
        <button className="toast-action" onClick={() => { t.undo!(); dismissToast(); }}>Annuler</button>
      )}
    </div>
  );
}
