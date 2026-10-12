import type { Equipment } from '../types';

/**
 * Appareils nécessaires à une recette, lus dans son texte (titre, étapes), en français, portugais et anglais.
 * Utilisé par l'appli (recettes importées) et par le serveur (recettes récoltées, dont on ne garde pas les étapes).
 */

/** Autre façon de cuire prévue par la recette elle-même, avec la phrase qui le dit. */
export interface EquipmentAlt {
  with: Equipment;
  tip: string;
}

export interface DetectedEquipment {
  equipment: Equipment[];
  alternatives: Partial<Record<Equipment, EquipmentAlt[]>>;
}

const PATTERNS: [Equipment, RegExp][] = [
  ['oven', /\bfours?\b|enfourn|\bforno\b|pre-?aquec|preheat|\boven\b/g],
  ['airfryer', /air ?fryer|airfryer|friteuse a air/g],
  ['microwave', /micro.?ondas?|microwave/g],
  ['blender', /\bmixe|blender|mixeur|liquidific|varinha/g],
  ['mixer', /batteur|fouet electrique|batedeira|stand mixer/g],
  ['stovetop', /poele|casserole|cocotte|\bfeu\b|frigideira|tacho|panela|\bwok\b|\blume\b|faire revenir|bouillir|frying pan|saucepan|skillet/g],
];

/** Cuissons qu'une recette peut proposer de remplacer par une autre. */
const COOKING: Equipment[] = ['oven', 'airfryer', 'microwave', 'stovetop'];
const REPLACEABLE: Equipment[] = ['oven', 'airfryer', 'microwave'];

/** « Vous pouvez aussi les faire à la poêle », « à défaut », « em alternativa »… */
const ALSO = /sinon|a defaut|(?:peu(?:t|x|vent)|pouvez|pouvons|possible) (?:aussi|egalement)|egalement (?:possible|realisable)|alternativ|tambem pode|pode(?:m)? tambem|ou entao|caso nao tenha|si vous n.avez pas|sans four|pas de four|can also|instead/;

const plain = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function positions(t: string): Map<Equipment, number[]> {
  const out = new Map<Equipment, number[]>();
  for (const [eq, re] of PATTERNS) {
    const at = [...t.matchAll(re)].map((m) => m.index ?? 0);
    if (at.length) out.set(eq, at);
  }
  return out;
}

export function detectEquipment(text: string): DetectedEquipment {
  const all = plain(text);
  const equipment = [...positions(all).keys()];
  const alternatives: Partial<Record<Equipment, EquipmentAlt[]>> = {};
  const add = (need: Equipment, other: Equipment, sentence: string) => {
    const list = (alternatives[need] ??= []);
    if (!list.some((a) => a.with === other)) list.push({ with: other, tip: sentence.trim().replace(/\s+/g, ' ').slice(0, 220) });
  };

  for (const sentence of text.split(/(?<=[.!?;])\s+|\n+/)) {
    const t = plain(sentence);
    const found = positions(t);
    const cooking = COOKING.filter((e) => found.has(e));
    if (!cooking.length) continue;
    // « au four ou à la poêle » : deux cuissons reliées par « ou » à quelques mots d'écart.
    for (const need of cooking.filter((e) => REPLACEABLE.includes(e))) {
      for (const other of cooking.filter((e) => e !== need)) {
        const near = found.get(need)!.some((a) =>
          found.get(other)!.some((b) => {
            const between = t.slice(Math.min(a, b), Math.max(a, b));
            return between.length < 60 && /\bou\b|\bor\b/.test(between);
          }),
        );
        if (near || ALSO.test(t)) add(need, other, sentence);
      }
    }
    // « Vous pouvez aussi les faire à la poêle » : autre cuisson pour celle que la recette demande ailleurs.
    if (ALSO.test(t) && cooking.length === 1) {
      for (const need of equipment.filter((e) => REPLACEABLE.includes(e) && e !== cooking[0])) add(need, cooking[0], sentence);
    }
  }
  return { equipment, alternatives };
}
