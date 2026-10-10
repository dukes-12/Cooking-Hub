import { useState } from 'react';
import { fromPlainText, importFromUrl } from '../lib/importer';
import { back, go } from '../router';
import { useApp } from '../state';
import type { Recipe } from '../types';
import { RecipeView } from './RecipeDetail';

export function Import() {
  const { actions } = useApp();
  const [mode, setMode] = useState<'url' | 'text'>('url');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Recipe | null>(null);
  const [title, setTitle] = useState('');
  const [servings, setServings] = useState(4);
  const [minutes, setMinutes] = useState('');
  const [ingText, setIngText] = useState('');
  const [stepText, setStepText] = useState('');

  if (preview) {
    return (
      <RecipeView
        recipe={preview}
        preview
        onSave={() => {
          actions.saveImported(preview);
          actions.like(preview.id);
          go(`/recipe/${preview.id}`);
        }}
      />
    );
  }

  const submitUrl = async () => {
    setError(null);
    setLoading(true);
    try {
      setPreview(await importFromUrl(url.trim()));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="screen">
      <header className="screen-head">
        <button className="icon-btn" onClick={() => back('/search')} aria-label="Retour">←</button>
        <h1 className="grow">Importer une recette</h1>
      </header>
      <p className="muted small">La recette est convertie au format Cooking Hub : ingrédients reconnus, calories, prix selon tes magasins et adaptations à ton profil.</p>
      <div className="segmented">
        <button className={mode === 'url' ? 'is-active' : ''} onClick={() => setMode('url')}>🔗 Depuis un lien</button>
        <button className={mode === 'text' ? 'is-active' : ''} onClick={() => setMode('text')}>✍️ Copier-coller</button>
      </div>

      {mode === 'url' ? (
        <div className="card">
          <label className="field">
            <span>Lien de la recette</span>
            <input className="input" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.marmiton.org/recettes/…" />
          </label>
          <button className="btn btn-primary btn-block" disabled={!url.trim() || loading} onClick={submitUrl}>
            {loading ? 'Analyse de la page…' : 'Importer'}
          </button>
          {error && (
            <p className="small warn-text">
              {error}
              <br />
              <button className="link" onClick={() => setMode('text')}>→ Utiliser le copier-coller</button>
            </p>
          )}
          <p className="small muted">Fonctionne avec la plupart des sites (Marmiton, 750g, Cuisine AZ, Jow, Ricardo, AllRecipes, BBC Good Food…) qui publient leurs recettes au format standard schema.org.</p>
        </div>
      ) : (
        <div className="card">
          <label className="field">
            <span>Nom de la recette</span>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ex. Tarte aux pommes de mamie" />
          </label>
          <div className="row gap">
            <label className="field grow">
              <span>Portions</span>
              <input className="input" type="number" min={1} value={servings} onChange={(e) => setServings(Math.max(1, Number(e.target.value)))} />
            </label>
            <label className="field grow">
              <span>Temps total (min)</span>
              <input className="input" type="number" min={0} value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="optionnel" />
            </label>
          </div>
          <label className="field">
            <span>Ingrédients (un par ligne)</span>
            <textarea className="input" rows={6} value={ingText} onChange={(e) => setIngText(e.target.value)} placeholder={'200 g de farine\n3 oeufs\n1 c. à soupe d’huile d’olive'} />
          </label>
          <label className="field">
            <span>Étapes (une par ligne)</span>
            <textarea className="input" rows={6} value={stepText} onChange={(e) => setStepText(e.target.value)} placeholder={'Préchauffer le four à 180 °C.\nMélanger…'} />
          </label>
          <button
            className="btn btn-primary btn-block"
            disabled={!title.trim() || !ingText.trim()}
            onClick={() => setPreview(fromPlainText(title.trim(), servings, ingText, stepText, minutes ? Number(minutes) : null))}
          >
            Prévisualiser
          </button>
        </div>
      )}
    </div>
  );
}
