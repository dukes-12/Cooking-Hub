import { detectEquipment } from '../lib/equipment';
import type { Recipe, RecipeIngredient, Unit } from '../types';
import { INGREDIENT_BY_ID } from './ingredients';
import { cuisineFromText } from './reference';

function i(id: string, qty: number | null, unit: Unit, extra: Partial<RecipeIngredient> = {}): RecipeIngredient {
  const ing = INGREDIENT_BY_ID[id];
  if (!ing) throw new Error(`Ingrédient inconnu dans le jeu de recettes : ${id}`);
  return { ingredientId: id, name: ing.name, qty, unit, ...extra };
}

const salt = i('sel', 1, 'pincee');
const pepper = i('poivre', 1, 'pincee');

/**
 * Recettes de démonstration, déjà au format uniformisé.
 * Les recettes importées depuis le web sont converties dans ce même format (voir lib/importer.ts).
 */
export const SEED_RECIPES: Recipe[] = [
  {
    id: 'pates-carbonara', title: 'Pâtes à la carbonara', emoji: '🍝', color: '#f4c95d', cuisine: 'Italienne', category: 'plat',
    servings: 2, prepMin: 5, cookMin: 12, difficulty: 1, equipment: ['stovetop'],
    ingredients: [i('pates', 200, 'g'), i('lardons', 125, 'g'), i('oeuf', 2, 'pc'), i('parmesan', 40, 'g'), pepper, salt],
    steps: [
      'Faire cuire les pâtes dans une grande casserole d’eau salée.',
      'Pendant ce temps, faire dorer les lardons à sec dans une poêle.',
      'Battre les œufs avec le parmesan râpé et beaucoup de poivre.',
      'Égoutter les pâtes en gardant une louche d’eau de cuisson. Hors du feu, mélanger pâtes, lardons et le mélange œufs-parmesan en ajoutant un peu d’eau de cuisson pour napper.',
    ],
  },
  {
    id: 'curry-pois-chiches', title: 'Curry de pois chiches au lait de coco', emoji: '🍛', color: '#f29e4c', cuisine: 'Indienne', category: 'plat',
    servings: 4, prepMin: 10, cookMin: 20, difficulty: 1, equipment: ['stovetop'],
    ingredients: [i('pois-chiches', 500, 'g'), i('lait-coco', 400, 'ml'), i('tomates-concassees', 400, 'g'), i('oignon', 1, 'pc'), i('ail', 2, 'gousse'), i('gingembre', 10, 'g', { optional: true }), i('curry', 2, 'cas'), i('epinard', 100, 'g', { optional: true }), i('riz', 300, 'g'), i('coriandre', 10, 'g', { optional: true }), salt],
    steps: [
      'Lancer la cuisson du riz.',
      'Émincer l’oignon, l’ail et le gingembre, les faire revenir 3 min dans un filet d’huile.',
      'Ajouter le curry, mélanger 1 min, puis les tomates, le lait de coco et les pois chiches égouttés.',
      'Laisser mijoter 15 min. Ajouter les épinards en fin de cuisson. Servir avec le riz et la coriandre.',
    ],
  },
  {
    id: 'saumon-four-legumes', title: 'Saumon rôti et légumes du soleil', emoji: '🐟', color: '#f7a072', cuisine: 'Française', category: 'plat',
    servings: 2, prepMin: 10, cookMin: 20, difficulty: 1, equipment: ['oven'],
    ingredients: [i('saumon', 260, 'g'), i('courgette', 1, 'pc'), i('poivron', 1, 'pc'), i('tomate-cerise', 150, 'g'), i('huile-olive', 2, 'cas'), i('citron', 1, 'pc'), i('herbes-provence', 1, 'cac'), salt, pepper],
    steps: [
      'Préchauffer le four à 200 °C.',
      'Couper courgette et poivron en dés, les mélanger avec les tomates cerises, l’huile, les herbes, sel et poivre sur une plaque.',
      'Enfourner 10 min, puis ajouter les pavés de saumon au milieu des légumes et poursuivre 10 à 12 min.',
      'Arroser de jus de citron avant de servir.',
    ],
  },
  {
    id: 'chili-sin-carne', title: 'Chili sin carne', emoji: '🌶️', color: '#d1495b', cuisine: 'Mexicaine', category: 'plat',
    servings: 4, prepMin: 10, cookMin: 30, difficulty: 1, equipment: ['stovetop'],
    ingredients: [i('haricots-rouges', 500, 'g'), i('lentilles', 100, 'g'), i('tomates-concassees', 400, 'g'), i('oignon', 1, 'pc'), i('poivron', 1, 'pc'), i('mais', 140, 'g'), i('cumin', 1, 'cac'), i('paprika', 1, 'cac'), i('piment', 1, 'pincee', { optional: true }), i('riz', 250, 'g'), salt],
    steps: [
      'Faire revenir l’oignon et le poivron émincés 5 min.',
      'Ajouter les épices, puis les tomates, les lentilles corail et 30 cl d’eau.',
      'Laisser mijoter 20 min, ajouter haricots rouges et maïs égouttés, poursuivre 5 min.',
      'Servir avec le riz.',
    ],
  },
  {
    id: 'omelette-champignons', title: 'Omelette aux champignons', emoji: '🍳', color: '#ffd166', cuisine: 'Française', category: 'plat',
    servings: 1, prepMin: 5, cookMin: 7, difficulty: 1, equipment: ['stovetop'],
    ingredients: [i('oeuf', 3, 'pc'), i('champignon', 100, 'g'), i('beurre', 10, 'g'), i('ciboulette', 5, 'g', { optional: true }), salt, pepper],
    steps: [
      'Émincer les champignons et les faire sauter dans la moitié du beurre 4 min.',
      'Battre les œufs avec sel et poivre.',
      'Ajouter le reste du beurre, verser les œufs, cuire à feu moyen en ramenant les bords vers le centre.',
      'Garnir de champignons et ciboulette, plier et servir.',
    ],
  },
  {
    id: 'gratin-dauphinois', title: 'Gratin dauphinois', emoji: '🥔', color: '#e9c46a', cuisine: 'Française', category: 'plat',
    servings: 4, prepMin: 20, cookMin: 60, difficulty: 2, equipment: ['oven'],
    ingredients: [i('pomme-de-terre', 1000, 'g'), i('creme', 250, 'ml'), i('lait', 250, 'ml'), i('ail', 1, 'gousse'), i('beurre', 10, 'g'), salt, pepper],
    steps: [
      'Préchauffer le four à 160 °C. Frotter un plat avec l’ail puis le beurrer.',
      'Éplucher et couper les pommes de terre en fines rondelles.',
      'Les disposer en couches, saler, poivrer. Verser le mélange lait-crème.',
      'Enfourner 1 h, jusqu’à ce que le dessus soit doré et les pommes de terre fondantes.',
    ],
  },
  {
    id: 'soupe-butternut', title: 'Velouté de butternut', emoji: '🎃', color: '#f4a259', cuisine: 'Française', category: 'soupe',
    servings: 4, prepMin: 15, cookMin: 25, difficulty: 1, equipment: ['stovetop', 'blender'],
    ingredients: [i('courge', 1000, 'g'), i('oignon', 1, 'pc'), i('pomme-de-terre', 200, 'g'), i('bouillon', 1, 'pc'), i('creme', 100, 'ml', { optional: true }), i('cumin', 1, 'pincee', { optional: true }), salt, pepper],
    steps: [
      'Éplucher et couper la courge, la pomme de terre et l’oignon en morceaux.',
      'Les mettre dans une casserole, couvrir d’eau (environ 1 L) avec le bouillon.',
      'Cuire 25 min jusqu’à ce que tout soit tendre.',
      'Mixer, ajouter la crème, rectifier l’assaisonnement.',
    ],
  },
  {
    id: 'poulet-curry-riz', title: 'Poulet au curry express', emoji: '🍗', color: '#f6bd60', cuisine: 'Indienne', category: 'plat',
    servings: 2, prepMin: 10, cookMin: 15, difficulty: 1, equipment: ['stovetop'],
    ingredients: [i('poulet', 300, 'g'), i('creme', 150, 'ml'), i('oignon', 1, 'pc'), i('curry', 1, 'cas'), i('riz', 150, 'g'), i('huile-tournesol', 1, 'cas'), salt],
    steps: [
      'Lancer la cuisson du riz.',
      'Couper le poulet en dés, émincer l’oignon.',
      'Faire dorer le poulet et l’oignon 5 min dans l’huile, ajouter le curry.',
      'Verser la crème, laisser mijoter 8 min. Servir avec le riz.',
    ],
  },
  {
    id: 'salade-grecque', title: 'Salade grecque', emoji: '🥗', color: '#90be6d', cuisine: 'Grecque', category: 'salade',
    servings: 2, prepMin: 15, cookMin: 0, difficulty: 1, equipment: [],
    ingredients: [i('tomate', 3, 'pc'), i('concombre', 1, 'pc'), i('feta', 150, 'g'), i('oignon', 0.5, 'pc'), i('huile-olive', 3, 'cas'), i('herbes-provence', 1, 'cac'), salt, pepper],
    steps: [
      'Couper tomates et concombre en gros dés, l’oignon rouge en fines lamelles.',
      'Ajouter la feta coupée en cubes.',
      'Assaisonner d’huile d’olive, d’origan, sel et poivre.',
    ],
  },
  {
    id: 'buddha-bowl', title: 'Buddha bowl quinoa & patate douce', emoji: '🥙', color: '#43aa8b', cuisine: 'Healthy', category: 'plat',
    servings: 2, prepMin: 15, cookMin: 25, difficulty: 1, equipment: ['oven', 'stovetop'],
    ingredients: [i('quinoa', 150, 'g'), i('patate-douce', 400, 'g'), i('pois-chiches', 250, 'g'), i('avocat', 1, 'pc'), i('epinard', 60, 'g'), i('huile-olive', 2, 'cas'), i('paprika', 1, 'cac'), i('citron', 0.5, 'pc'), i('sesame', 10, 'g', { optional: true }), salt],
    steps: [
      'Préchauffer le four à 200 °C. Couper la patate douce en cubes, mélanger avec la moitié de l’huile et le paprika, enfourner 25 min.',
      'Ajouter les pois chiches égouttés sur la plaque les 10 dernières minutes.',
      'Cuire le quinoa 12 min dans l’eau bouillante salée.',
      'Dresser : quinoa, épinards, patate douce, pois chiches, avocat. Arroser de citron et du reste d’huile, parsemer de sésame.',
    ],
  },
  {
    id: 'bolognaise', title: 'Spaghetti bolognaise', emoji: '🍝', color: '#e76f51', cuisine: 'Italienne', category: 'plat',
    servings: 4, prepMin: 15, cookMin: 40, difficulty: 1, equipment: ['stovetop'],
    ingredients: [i('pates', 400, 'g'), i('boeuf-hache', 400, 'g'), i('tomates-concassees', 600, 'g'), i('oignon', 1, 'pc'), i('carotte', 1, 'pc'), i('ail', 2, 'gousse'), i('concentre-tomate', 30, 'g', { optional: true }), i('herbes-provence', 1, 'cac'), i('parmesan', 40, 'g', { optional: true }), salt, pepper],
    steps: [
      'Hacher oignon, carotte et ail, les faire revenir 5 min.',
      'Ajouter la viande et la faire dorer en l’émiettant.',
      'Ajouter tomates, concentré et herbes, laisser mijoter 30 min à couvert.',
      'Cuire les pâtes, servir avec la sauce et le parmesan.',
    ],
  },
  {
    id: 'tarte-poireaux', title: 'Tarte fine aux poireaux et chèvre', emoji: '🥧', color: '#a7c957', cuisine: 'Française', category: 'plat',
    servings: 4, prepMin: 15, cookMin: 35, difficulty: 2, equipment: ['oven', 'stovetop'],
    ingredients: [i('pate-feuilletee', 1, 'pc'), i('poireau', 3, 'pc'), i('chevre', 150, 'g'), i('oeuf', 2, 'pc'), i('creme', 150, 'ml'), i('beurre', 15, 'g'), salt, pepper],
    steps: [
      'Préchauffer le four à 180 °C. Émincer les poireaux et les faire fondre 10 min dans le beurre.',
      'Étaler la pâte dans un moule, piquer le fond.',
      'Battre œufs et crème, saler, poivrer. Répartir les poireaux, verser l’appareil, ajouter le chèvre en rondelles.',
      'Enfourner 30 à 35 min.',
    ],
  },
  {
    id: 'wok-legumes-nouilles', title: 'Wok de nouilles aux légumes', emoji: '🥢', color: '#f9844a', cuisine: 'Asiatique', category: 'plat',
    servings: 2, prepMin: 15, cookMin: 10, difficulty: 1, equipment: ['stovetop'],
    ingredients: [i('nouilles', 150, 'g'), i('carotte', 1, 'pc'), i('poivron', 1, 'pc'), i('brocoli', 150, 'g'), i('sauce-soja', 3, 'cas'), i('gingembre', 10, 'g'), i('ail', 1, 'gousse'), i('huile-tournesol', 1, 'cas'), i('sesame', 10, 'g', { optional: true })],
    steps: [
      'Réhydrater les nouilles dans l’eau chaude selon le paquet.',
      'Couper les légumes en fines lanières, hacher ail et gingembre.',
      'Saisir les légumes 5 min à feu vif dans l’huile, ajouter ail et gingembre.',
      'Ajouter les nouilles et la sauce soja, sauter 2 min. Parsemer de sésame.',
    ],
  },
  {
    id: 'crepes', title: 'Crêpes maison', emoji: '🥞', color: '#ffcb77', cuisine: 'Française', category: 'dessert',
    servings: 4, prepMin: 10, cookMin: 20, difficulty: 1, equipment: ['stovetop'],
    ingredients: [i('farine', 250, 'g'), i('oeuf', 3, 'pc'), i('lait', 500, 'ml'), i('sucre', 30, 'g'), i('beurre', 30, 'g'), salt],
    steps: [
      'Mélanger farine, sucre et sel. Creuser un puits, ajouter les œufs.',
      'Incorporer le lait petit à petit en fouettant pour éviter les grumeaux, puis le beurre fondu.',
      'Laisser reposer 30 min si possible.',
      'Cuire les crêpes dans une poêle chaude légèrement beurrée, 1 min de chaque côté.',
    ],
  },
  {
    id: 'gateau-chocolat', title: 'Fondant au chocolat', emoji: '🍫', color: '#7f5539', cuisine: 'Française', category: 'dessert',
    servings: 6, prepMin: 15, cookMin: 22, difficulty: 2, equipment: ['oven'],
    ingredients: [i('chocolat', 200, 'g'), i('beurre', 150, 'g'), i('sucre', 120, 'g'), i('oeuf', 4, 'pc'), i('farine', 50, 'g')],
    steps: [
      'Préchauffer le four à 180 °C.',
      'Faire fondre chocolat et beurre (au bain-marie ou au micro-ondes par tranches de 30 s).',
      'Fouetter œufs et sucre, ajouter le chocolat fondu puis la farine.',
      'Verser dans un moule beurré et cuire 20 à 22 min : le cœur doit rester tremblant.',
    ],
  },
  {
    id: 'porridge', title: 'Porridge banane & cannelle', emoji: '🥣', color: '#ddb892', cuisine: 'Healthy', category: 'petit-dej',
    servings: 1, prepMin: 2, cookMin: 5, difficulty: 1, equipment: ['stovetop'],
    ingredients: [i('flocons-avoine', 50, 'g'), i('lait', 200, 'ml'), i('banane', 1, 'pc'), i('cannelle', 1, 'pincee'), i('miel', 1, 'cac', { optional: true }), i('noix', 10, 'g', { optional: true })],
    steps: [
      'Porter le lait à frémissement avec les flocons et la cannelle.',
      'Cuire 4 à 5 min en remuant jusqu’à épaississement.',
      'Servir avec la banane en rondelles, le miel et les noix.',
    ],
  },
  {
    id: 'shakshuka', title: 'Shakshuka', emoji: '🍅', color: '#e63946', cuisine: 'Moyen-Orient', category: 'plat',
    servings: 2, prepMin: 10, cookMin: 20, difficulty: 1, equipment: ['stovetop'],
    ingredients: [i('oeuf', 4, 'pc'), i('tomates-concassees', 400, 'g'), i('poivron', 1, 'pc'), i('oignon', 1, 'pc'), i('ail', 2, 'gousse'), i('cumin', 1, 'cac'), i('paprika', 1, 'cac'), i('coriandre', 10, 'g', { optional: true }), i('pain', 120, 'g', { optional: true }), salt],
    steps: [
      'Faire revenir oignon, poivron et ail émincés 5 min.',
      'Ajouter les épices puis les tomates, laisser compoter 10 min.',
      'Creuser 4 puits, y casser les œufs, couvrir et cuire 5 à 6 min.',
      'Parsemer de coriandre, servir avec du pain.',
    ],
  },
  {
    id: 'risotto-champignons', title: 'Risotto aux champignons', emoji: '🍄', color: '#b08968', cuisine: 'Italienne', category: 'plat',
    servings: 3, prepMin: 10, cookMin: 25, difficulty: 2, equipment: ['stovetop'],
    ingredients: [i('riz', 250, 'g'), i('champignon', 300, 'g'), i('echalote', 2, 'pc'), i('vin-blanc', 100, 'ml', { optional: true }), i('bouillon', 2, 'pc'), i('parmesan', 50, 'g'), i('beurre', 30, 'g'), salt, pepper],
    steps: [
      'Préparer 1 L de bouillon chaud.',
      'Faire suer les échalotes dans la moitié du beurre, ajouter le riz et le nacrer 2 min.',
      'Déglacer au vin blanc, puis ajouter le bouillon louche par louche en remuant (18 min).',
      'Pendant ce temps, poêler les champignons. Les incorporer avec le parmesan et le reste du beurre.',
    ],
  },
  {
    id: 'dal-lentilles', title: 'Dal de lentilles corail', emoji: '🫘', color: '#ee9b00', cuisine: 'Indienne', category: 'plat',
    servings: 4, prepMin: 10, cookMin: 25, difficulty: 1, equipment: ['stovetop'],
    ingredients: [i('lentilles', 250, 'g'), i('lait-coco', 200, 'ml'), i('tomates-concassees', 400, 'g'), i('oignon', 1, 'pc'), i('ail', 2, 'gousse'), i('gingembre', 10, 'g'), i('curry', 1, 'cas'), i('cumin', 1, 'cac'), i('riz', 250, 'g', { optional: true }), salt],
    steps: [
      'Faire revenir oignon, ail et gingembre hachés avec les épices.',
      'Ajouter les lentilles rincées, les tomates, le lait de coco et 50 cl d’eau.',
      'Cuire 20 min à feu doux en remuant régulièrement.',
      'Servir avec du riz ou du pain.',
    ],
  },
  {
    id: 'quesadillas', title: 'Quesadillas poulet & poivron', emoji: '🌮', color: '#f8961e', cuisine: 'Mexicaine', category: 'plat',
    servings: 2, prepMin: 10, cookMin: 10, difficulty: 1, equipment: ['stovetop'],
    ingredients: [i('tortilla', 4, 'pc'), i('poulet', 200, 'g'), i('poivron', 1, 'pc'), i('emmental', 100, 'g'), i('haricots-rouges', 100, 'g', { optional: true }), i('paprika', 1, 'cac'), salt],
    steps: [
      'Faire sauter le poulet en lamelles et le poivron avec le paprika 6 min.',
      'Garnir une moitié de chaque tortilla de fromage, poulet, poivron et haricots. Replier.',
      'Dorer à la poêle 2 min de chaque côté. Couper en triangles.',
    ],
  },
  {
    id: 'cabillaud-vapeur', title: 'Cabillaud, brocoli & beurre citronné', emoji: '🐠', color: '#4d908e', cuisine: 'Française', category: 'plat',
    servings: 2, prepMin: 10, cookMin: 12, difficulty: 1, equipment: ['stovetop'],
    ingredients: [i('cabillaud', 300, 'g'), i('brocoli', 300, 'g'), i('pomme-de-terre', 300, 'g'), i('beurre', 20, 'g'), i('citron', 1, 'pc'), i('persil', 5, 'g', { optional: true }), salt, pepper],
    steps: [
      'Cuire les pommes de terre en morceaux 15 min à l’eau salée.',
      'Cuire le brocoli et le cabillaud à la vapeur 8 à 10 min (ou à la poêle couverte avec un fond d’eau).',
      'Faire fondre le beurre avec le jus de citron.',
      'Servir le poisson nappé de beurre citronné, avec légumes et persil.',
    ],
  },
  {
    id: 'pizza-maison', title: 'Pizza maison tomate-mozza', emoji: '🍕', color: '#ef476f', cuisine: 'Italienne', category: 'plat',
    servings: 2, prepMin: 10, cookMin: 15, difficulty: 1, equipment: ['oven'],
    ingredients: [i('pate-pizza', 1, 'pc'), i('tomates-concassees', 150, 'g'), i('mozzarella', 125, 'g'), i('jambon', 2, 'pc', { optional: true }), i('champignon', 100, 'g', { optional: true }), i('basilic', 5, 'g', { optional: true }), i('huile-olive', 1, 'cas'), i('herbes-provence', 1, 'cac')],
    steps: [
      'Préchauffer le four à 240 °C.',
      'Étaler la pâte, la couvrir de sauce tomate assaisonnée d’herbes.',
      'Ajouter mozzarella, jambon et champignons.',
      'Cuire 12 à 15 min, ajouter basilic et un filet d’huile à la sortie.',
    ],
  },
  {
    id: 'boeuf-bourguignon', title: 'Bœuf bourguignon', emoji: '🥘', color: '#9d0208', cuisine: 'Française', category: 'plat',
    servings: 6, prepMin: 30, cookMin: 180, difficulty: 3, equipment: ['stovetop'],
    ingredients: [i('boeuf-braiser', 1200, 'g'), i('vin-rouge', 750, 'ml'), i('lardons', 150, 'g'), i('carotte', 3, 'pc'), i('oignon', 2, 'pc'), i('champignon', 250, 'g'), i('farine', 2, 'cas'), i('ail', 2, 'gousse'), i('herbes-provence', 1, 'cac'), i('bouillon', 1, 'pc'), salt, pepper],
    steps: [
      'Couper la viande en gros cubes, la faire dorer en plusieurs fois dans une cocotte.',
      'Faire revenir lardons, oignons et carottes. Remettre la viande, saupoudrer de farine.',
      'Mouiller avec le vin et un bouillon, ajouter ail et herbes. Couvrir et cuire 2 h 30 à feu très doux.',
      'Ajouter les champignons poêlés 20 min avant la fin.',
    ],
  },
  {
    id: 'smoothie-bowl', title: 'Smoothie bowl fruits rouges', emoji: '🫐', color: '#9b5de5', cuisine: 'Healthy', category: 'petit-dej',
    servings: 1, prepMin: 5, cookMin: 0, difficulty: 1, equipment: ['blender'],
    ingredients: [i('fruits-rouges', 150, 'g'), i('banane', 1, 'pc'), i('yaourt-grec', 100, 'g'), i('flocons-avoine', 20, 'g', { optional: true }), i('miel', 1, 'cac', { optional: true })],
    steps: [
      'Mixer fruits rouges surgelés, banane et yaourt jusqu’à obtenir une texture épaisse.',
      'Verser dans un bol, garnir de flocons d’avoine et d’un filet de miel.',
    ],
  },
  {
    id: 'croque-monsieur', title: 'Croque-monsieur', emoji: '🥪', color: '#e9c46a', cuisine: 'Française', category: 'snack',
    servings: 2, prepMin: 5, cookMin: 10, difficulty: 1, equipment: ['oven'],
    ingredients: [i('pain', 160, 'g', { note: '4 tranches de pain de mie' }), i('jambon', 2, 'pc'), i('emmental', 80, 'g'), i('beurre', 15, 'g'), i('creme', 30, 'ml', { optional: true })],
    steps: [
      'Préchauffer le four à 200 °C (ou utiliser un appareil à croque / une poêle).',
      'Beurrer les tranches, garnir de jambon et fromage, refermer.',
      'Napper d’un peu de crème et de fromage, enfourner 8 à 10 min jusqu’à ce que ce soit doré.',
    ],
  },
  {
    id: 'lentilles-saucisses', title: 'Petit salé aux lentilles express', emoji: '🌭', color: '#6a994e', cuisine: 'Française', category: 'plat',
    servings: 4, prepMin: 10, cookMin: 35, difficulty: 1, equipment: ['stovetop'],
    ingredients: [i('saucisse', 4, 'pc'), i('lentilles', 300, 'g', { note: 'lentilles vertes' }), i('carotte', 2, 'pc'), i('oignon', 1, 'pc'), i('herbes-provence', 1, 'cac'), i('bouillon', 1, 'pc'), i('moutarde', 1, 'cas', { optional: true }), salt, pepper],
    steps: [
      'Faire dorer les saucisses dans une cocotte, réserver.',
      'Faire revenir oignon et carottes en rondelles, ajouter lentilles, herbes, bouillon et 1 L d’eau.',
      'Remettre les saucisses, cuire 30 min à couvert.',
      'Servir avec un peu de moutarde.',
    ],
  },
  // ---------- Cuisine portugaise ----------
  {
    id: 'bacalhau-a-bras', title: 'Bacalhau à Brás', emoji: '🐟', color: '#f2cc8f', cuisine: 'Portugaise', category: 'plat',
    servings: 4, prepMin: 20, cookMin: 20, difficulty: 2, equipment: ['stovetop'],
    ingredients: [i('morue', 400, 'g'), i('pomme-de-terre', 500, 'g'), i('oignon', 2, 'pc'), i('ail', 2, 'gousse'), i('oeuf', 6, 'pc'), i('huile-olive', 4, 'cas'), i('persil', 10, 'g', { optional: true }), salt, pepper],
    steps: [
      'Effilocher la morue dessalée en retirant peau et arêtes.',
      'Couper les pommes de terre en très fines allumettes et les faire dorer à la poêle dans un fond d’huile. Égoutter.',
      'Faire fondre les oignons émincés et l’ail dans l’huile d’olive, ajouter la morue et cuire 5 min.',
      'Ajouter les pommes de terre, puis les œufs battus hors du feu ou à feu très doux : ils doivent rester crémeux. Parsemer de persil.',
    ],
  },
  {
    id: 'caldo-verde', title: 'Caldo verde', emoji: '🥬', color: '#90a955', cuisine: 'Portugaise', category: 'soupe',
    servings: 4, prepMin: 15, cookMin: 30, difficulty: 1, equipment: ['stovetop', 'blender'],
    ingredients: [i('pomme-de-terre', 600, 'g'), i('chou-kale', 200, 'g'), i('oignon', 1, 'pc'), i('ail', 2, 'gousse'), i('chorizo', 100, 'g', { optional: true, note: 'chouriço' }), i('huile-olive', 3, 'cas'), salt],
    steps: [
      'Cuire pommes de terre, oignon et ail dans 1,2 L d’eau salée pendant 20 min.',
      'Mixer en velouté (ou écraser au presse-purée).',
      'Ajouter le chou émincé en très fines lanières et cuire 5 min.',
      'Servir avec un filet d’huile d’olive et des rondelles de chouriço grillées.',
    ],
  },
  {
    id: 'frango-piri-piri', title: 'Poulet piri-piri', emoji: '🌶️', color: '#e85d04', cuisine: 'Portugaise', category: 'plat',
    servings: 4, prepMin: 15, cookMin: 40, difficulty: 1, equipment: ['oven'],
    ingredients: [i('cuisse-poulet', 1000, 'g'), i('citron', 1, 'pc'), i('ail', 4, 'gousse'), i('piment', 2, 'cac'), i('paprika', 1, 'cac'), i('huile-olive', 4, 'cas'), i('salade', 1, 'pc', { optional: true }), salt],
    steps: [
      'Mixer ou hacher l’ail avec le piment, le paprika, le jus de citron, l’huile et le sel.',
      'Entailler le poulet, l’enrober de marinade et laisser reposer au moins 30 min.',
      'Rôtir 40 min à 210 °C en arrosant à mi-cuisson (ou au barbecue).',
      'Servir avec une salade verte et des frites ou du riz.',
    ],
  },
  {
    id: 'bifanas', title: 'Bifanas (sandwich au porc mariné)', emoji: '🥪', color: '#dda15e', cuisine: 'Portugaise', category: 'snack',
    servings: 4, prepMin: 10, cookMin: 15, difficulty: 1, equipment: ['stovetop'],
    ingredients: [i('porc', 500, 'g', { note: 'escalopes très fines' }), i('vin-blanc', 150, 'ml'), i('ail', 4, 'gousse'), i('paprika', 1, 'cac'), i('herbes-provence', 1, 'pincee', { note: 'laurier' }), i('pain', 320, 'g', { note: '4 petits pains' }), i('moutarde', 1, 'cas', { optional: true }), i('huile-olive', 2, 'cas'), salt],
    steps: [
      'Faire mariner le porc avec le vin blanc, l’ail écrasé, le paprika, le laurier et le sel (1 h idéalement).',
      'Saisir les escalopes à la poêle bien chaude dans l’huile, 1 à 2 min par face.',
      'Verser la marinade et laisser réduire 5 min.',
      'Garnir les petits pains de viande, arroser de sauce, ajouter un peu de moutarde.',
    ],
  },
  {
    id: 'arroz-doce', title: 'Arroz doce (riz au lait portugais)', emoji: '🍚', color: '#f6e7b4', cuisine: 'Portugaise', category: 'dessert',
    servings: 6, prepMin: 5, cookMin: 45, difficulty: 2, equipment: ['stovetop'],
    ingredients: [i('riz', 200, 'g', { note: 'riz rond' }), i('lait', 1000, 'ml'), i('sucre', 160, 'g'), i('citron', 1, 'pc', { note: 'zeste' }), i('oeuf', 3, 'pc', { note: 'jaunes' }), i('cannelle', 1, 'cac'), salt],
    steps: [
      'Cuire le riz 5 min dans 40 cl d’eau avec une pincée de sel et le zeste de citron.',
      'Ajouter le lait chaud petit à petit et cuire 30 min à feu doux en remuant.',
      'Ajouter le sucre, puis hors du feu les jaunes d’œufs délayés dans un peu de lait. Remettre 2 min à feu doux.',
      'Verser dans un plat et dessiner des motifs avec la cannelle. Servir froid.',
    ],
  },
];

for (const r of SEED_RECIPES) r.origin ??= cuisineFromText(r.cuisine);

// Cuissons de remplacement écrites dans les étapes (« ou une poêle ») : gardées pour qui n'a pas le four.
for (const r of SEED_RECIPES) {
  const { alternatives } = detectEquipment(r.steps.join('\n'));
  if (Object.keys(alternatives).length) r.equipmentAlt = alternatives;
}
