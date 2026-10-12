import type { Aisle, BaseUnit, FoodTag, Ingredient } from '../types';

/**
 * Base d'ingrédients de référence.
 * Nutrition pour 100 g (tables Ciqual approx.), prix moyen France 2026 en €/kg ou €/L.
 */
function ing(
  id: string,
  name: string,
  aisle: Aisle,
  unit: BaseUnit,
  [kcal, protein, carbs, fat]: [number, number, number, number],
  pricePerKg: number,
  tags: FoodTag[] = [],
  extra: Partial<Ingredient> = {},
): Ingredient {
  return { id, name, aisle, unit, kcal, protein, carbs, fat, pricePerKg, tags, aliases: [], ...extra };
}

export const INGREDIENTS: Ingredient[] = [
  // Fruits & légumes
  ing('oignon', 'Oignon', 'fruits-legumes', 'pc', [40, 1.1, 9, 0.1], 2.2, [], { pieceG: 120, aliases: ['oignons', 'oignon jaune', 'oignon rouge', 'cebola', 'cebolas'], subs: ['echalote'] }),
  ing('echalote', 'Échalote', 'fruits-legumes', 'pc', [72, 2.5, 17, 0.1], 6, [], { pieceG: 30, aliases: ['echalotes'], subs: ['oignon'] }),
  ing('ail', 'Ail', 'fruits-legumes', 'pc', [131, 6.4, 28, 0.5], 9, [], { pieceG: 5, aliases: ["gousse d'ail", "gousses d'ail", 'ail', 'alho'], subs: ['echalote'] }),
  ing('carotte', 'Carotte', 'fruits-legumes', 'pc', [36, 0.8, 7.6, 0.3], 1.6, [], { pieceG: 100, aliases: ['carottes', 'cenoura', 'cenouras'] }),
  ing('pomme-de-terre', 'Pomme de terre', 'fruits-legumes', 'g', [80, 2, 17, 0.1], 1.5, [], { aliases: ['pommes de terre', 'patate', 'patates', 'batata', 'batatas', 'batatinhas'], subs: ['patate-douce'] }),
  ing('patate-douce', 'Patate douce', 'fruits-legumes', 'g', [86, 1.6, 20, 0.1], 3.5, [], { aliases: ['patates douces'], subs: ['pomme-de-terre', 'courge'] }),
  ing('tomate', 'Tomate', 'fruits-legumes', 'pc', [19, 0.8, 3, 0.2], 3.2, [], { pieceG: 120, aliases: ['tomates', 'tomate'], subs: ['tomates-concassees'] }),
  ing('tomate-cerise', 'Tomates cerises', 'fruits-legumes', 'g', [24, 0.9, 4, 0.3], 7, [], { aliases: ['tomate cerise'], subs: ['tomate'] }),
  ing('courgette', 'Courgette', 'fruits-legumes', 'pc', [17, 1.2, 2, 0.3], 2.8, [], { pieceG: 250, aliases: ['courgettes', 'curgete', 'courgette'], subs: ['aubergine'] }),
  ing('aubergine', 'Aubergine', 'fruits-legumes', 'pc', [25, 1, 4, 0.2], 3.5, [], { pieceG: 300, aliases: ['aubergines'], subs: ['courgette'] }),
  ing('poivron', 'Poivron', 'fruits-legumes', 'pc', [27, 0.9, 5, 0.3], 4.5, [], { pieceG: 160, aliases: ['poivrons', 'poivron rouge', 'poivron vert', 'pimento', 'pimentos'] }),
  ing('champignon', 'Champignons de Paris', 'fruits-legumes', 'g', [24, 3, 1, 0.3], 5, [], { aliases: ['champignons', 'champignon de paris', 'cogumelos', 'cogumelo'] }),
  ing('epinard', 'Épinards frais', 'fruits-legumes', 'g', [23, 2.9, 1.4, 0.4], 6, [], { aliases: ['epinards', 'pousses d epinard', 'espinafres'] }),
  ing('brocoli', 'Brocoli', 'fruits-legumes', 'g', [34, 2.8, 4, 0.4], 3.5, [], { aliases: ['brocolis'] }),
  ing('poireau', 'Poireau', 'fruits-legumes', 'pc', [27, 1.5, 4, 0.3], 2.8, [], { pieceG: 200, aliases: ['poireaux'] }),
  ing('courge', 'Courge butternut', 'fruits-legumes', 'g', [45, 1, 10, 0.1], 2.2, [], { aliases: ['butternut', 'potiron', 'citrouille'], subs: ['patate-douce'] }),
  ing('salade', 'Salade verte', 'fruits-legumes', 'pc', [15, 1.3, 1.5, 0.2], 4, [], { pieceG: 300, aliases: ['laitue', 'mache', 'roquette', 'salade', 'alface'] }),
  ing('concombre', 'Concombre', 'fruits-legumes', 'pc', [13, 0.6, 2, 0.1], 2.5, [], { pieceG: 350, aliases: ['concombres', 'pepino'] }),
  ing('avocat', 'Avocat', 'fruits-legumes', 'pc', [205, 1.9, 1, 20], 7, [], { pieceG: 170, aliases: ['avocats'] }),
  ing('citron', 'Citron', 'fruits-legumes', 'pc', [29, 1, 3, 0.3], 4, [], { pieceG: 120, aliases: ['citrons', 'jus de citron', 'citron vert', 'limão', 'limao'] }),
  ing('pomme', 'Pomme', 'fruits-legumes', 'pc', [53, 0.3, 11, 0.2], 2.6, [], { pieceG: 150, aliases: ['pommes', 'maçã', 'maca', 'maçãs'], subs: ['poire'] }),
  ing('poire', 'Poire', 'fruits-legumes', 'pc', [50, 0.4, 11, 0.1], 3, [], { pieceG: 160, aliases: ['poires'], subs: ['pomme'] }),
  ing('banane', 'Banane', 'fruits-legumes', 'pc', [90, 1.1, 20, 0.3], 2.1, [], { pieceG: 120, aliases: ['bananes', 'banana', 'bananas'] }),
  ing('fruits-rouges', 'Fruits rouges', 'surgeles', 'g', [45, 1, 8, 0.4], 9, [], { aliases: ['framboises', 'myrtilles', 'fraises', 'fruits rouges surgeles'] }),
  ing('chou-kale', 'Chou kale (couve)', 'fruits-legumes', 'g', [49, 4.3, 5, 0.9], 7, [], { aliases: ['kale', 'chou frise', 'couve', 'couve galega', 'chou vert'], subs: ['epinard'] }),
  ing('persil', 'Persil', 'fruits-legumes', 'g', [36, 3, 3, 0.8], 20, [], { aliases: ['persil plat'], subs: ['coriandre', 'ciboulette'] }),
  ing('coriandre', 'Coriandre', 'fruits-legumes', 'g', [23, 2, 1, 0.5], 25, [], { aliases: ['coriandre fraiche'], subs: ['persil'] }),
  ing('basilic', 'Basilic', 'fruits-legumes', 'g', [23, 3, 1, 0.6], 30, [], { aliases: ['basilic frais'], subs: ['persil'] }),
  ing('ciboulette', 'Ciboulette', 'fruits-legumes', 'g', [30, 3, 2, 0.7], 30, [], { subs: ['persil'] }),
  ing('gingembre', 'Gingembre frais', 'fruits-legumes', 'g', [80, 1.8, 15, 0.8], 8, [], { aliases: ['gingembre'] }),

  // Boucherie
  ing('poulet', 'Blanc de poulet', 'boucherie', 'g', [121, 23, 0, 2.6], 13, ['meat', 'poultry'], { aliases: ['filet de poulet', 'blancs de poulet', 'escalope de poulet', 'poulet', 'frango', 'peito de frango', 'peitos de frango', 'chicken breast'], subs: ['dinde', 'tofu'] }),
  ing('cuisse-poulet', 'Cuisses de poulet', 'boucherie', 'g', [190, 18, 0, 13], 7, ['meat', 'poultry'], { aliases: ['cuisse de poulet', 'hauts de cuisse'], subs: ['poulet'] }),
  ing('dinde', 'Escalope de dinde', 'boucherie', 'g', [110, 24, 0, 1.5], 12, ['meat', 'poultry'], { aliases: ['dinde'], subs: ['poulet'] }),
  ing('boeuf-hache', 'Bœuf haché 5%', 'boucherie', 'g', [125, 21, 0, 5], 13, ['meat', 'beef'], { aliases: ['viande hachee', 'steak hache', 'boeuf hache', 'carne picada'], subs: ['lentilles', 'proteines-soja'] }),
  ing('boeuf-braiser', 'Bœuf à braiser', 'boucherie', 'g', [150, 28, 0, 4], 15, ['meat', 'beef'], { aliases: ['paleron', 'boeuf bourguignon', 'joue de boeuf', 'boeuf'] }),
  ing('porc', 'Escalope / échine de porc', 'boucherie', 'g', [140, 21, 0, 6], 9.5, ['meat', 'pork'], { aliases: ['porc', 'echine de porc', 'escalope de porc', 'filet mignon de porc', 'cotes de porc', 'lombo de porco', 'febras'], subs: ['dinde', 'poulet'] }),
  ing('lardons', 'Lardons', 'boucherie', 'g', [270, 15, 0.5, 23], 11, ['meat', 'pork'], { aliases: ['lardon', 'lardons fumes', 'poitrine fumée', 'poitrine fumee', 'bacon', 'toucinho'], subs: ['lardons-volaille'] }),
  ing('lardons-volaille', 'Lardons de volaille', 'boucherie', 'g', [140, 18, 1, 7], 13, ['meat', 'poultry'], { aliases: ['allumettes de dinde'], subs: ['lardons'] }),
  ing('jambon', 'Jambon blanc', 'boucherie', 'pc', [115, 20, 1, 3.5], 14, ['meat', 'pork'], { pieceG: 45, aliases: ['tranche de jambon', 'tranches de jambon', 'jambon', 'fiambre'], subs: ['dinde'] }),
  ing('chorizo', 'Chorizo', 'boucherie', 'g', [450, 24, 2, 38], 16, ['meat', 'pork'], { aliases: [] }),
  ing('saucisse', 'Saucisses', 'boucherie', 'pc', [280, 13, 2, 25], 10, ['meat', 'pork'], { pieceG: 100, aliases: ['saucisse de toulouse', 'chipolatas', 'alheira', 'alheiras', 'farinheira', 'linguiça', 'salsichas'] }),

  // Poissonnerie
  ing('saumon', 'Pavé de saumon', 'poissonnerie', 'g', [200, 20, 0, 13], 24, ['fish'], { aliases: ['saumon', 'paves de saumon', 'filet de saumon', 'salmão', 'salmao'], subs: ['cabillaud'] }),
  ing('cabillaud', 'Dos de cabillaud', 'poissonnerie', 'g', [82, 18, 0, 0.7], 22, ['fish'], { aliases: ['cabillaud', 'colin', 'poisson blanc', 'merlu'], subs: ['saumon'] }),
  ing('thon-boite', 'Thon en boîte', 'conserves', 'g', [116, 26, 0, 1], 14, ['fish'], { aliases: ['thon', 'thon au naturel'], subs: ['pois-chiches'] }),
  ing('morue', 'Morue dessalée (bacalhau)', 'poissonnerie', 'g', [105, 23, 0, 0.9], 16, ['fish'], { aliases: ['morue', 'bacalhau', 'cabillaud sale', 'bacalhau demolhado'], subs: ['cabillaud'] }),
  ing('crevette', 'Crevettes décortiquées', 'poissonnerie', 'g', [95, 21, 0, 1], 22, ['seafood'], { aliases: ['crevettes', 'gambas', 'camarão', 'camarões', 'camaroes'] }),

  // Crèmerie
  ing('oeuf', 'Œuf', 'cremerie', 'pc', [140, 12.5, 0.7, 9.8], 6, ['egg'], { pieceG: 55, aliases: ['oeufs', 'œufs', 'œuf', 'jaune d oeuf', "blanc d'oeuf", "jaunes d'oeufs", "blancs d'oeufs", 'gema', 'gemas', 'clara', 'claras', 'ovo', 'ovos'] }),
  ing('beurre', 'Beurre', 'cremerie', 'g', [740, 0.7, 0.7, 82], 11, ['dairy'], { aliases: ['beurre doux', 'beurre demi-sel', 'manteiga'], subs: ['huile-olive', 'margarine'] }),
  ing('margarine', 'Margarine végétale', 'cremerie', 'g', [540, 0, 0.5, 60], 7, [], { subs: ['beurre'] }),
  ing('lait', 'Lait demi-écrémé', 'cremerie', 'ml', [46, 3.2, 4.8, 1.6], 1.05, ['dairy'], { density: 1.03, aliases: ['lait', 'leite', 'leite meio gordo', 'leite magro', 'leite gordo'], subs: ['lait-vegetal'] }),
  ing('lait-vegetal', "Boisson d'avoine", 'cremerie', 'ml', [45, 0.5, 7, 1.5], 2, ['gluten'], { aliases: ['lait vegetal', 'lait d avoine', 'lait de soja', "boisson d'amande"], subs: ['lait'] }),
  ing('creme', 'Crème fraîche', 'cremerie', 'ml', [300, 2.4, 3, 30], 6.5, ['dairy'], { aliases: ['creme fraiche', 'creme liquide', 'creme epaisse', 'crème', 'natas', 'nata'], subs: ['yaourt-grec', 'creme-coco', 'creme-vegetale'] }),
  ing('creme-vegetale', 'Crème végétale (soja)', 'cremerie', 'ml', [170, 2.5, 4, 16], 7, ['soy'], { aliases: ['creme soja', 'creme d avoine'], subs: ['creme', 'creme-coco'] }),
  ing('yaourt', 'Yaourt nature', 'cremerie', 'pc', [55, 4.3, 5, 1.3], 2.5, ['dairy'], { pieceG: 125, aliases: ['yaourts', 'yaourt nature', 'iogurte', 'iogurtes', 'iogurte natural'], subs: ['yaourt-grec'] }),
  ing('yaourt-grec', 'Yaourt grec', 'cremerie', 'g', [120, 6, 4, 10], 5.5, ['dairy'], { aliases: ['fromage blanc', 'skyr', 'iogurte grego'], subs: ['creme', 'yaourt'] }),
  ing('emmental', 'Emmental râpé', 'cremerie', 'g', [380, 28, 0, 29], 10, ['dairy'], { aliases: ['gruyere', 'fromage rape', 'comte', 'queijo emmental'], subs: ['parmesan', 'mozzarella'] }),
  ing('parmesan', 'Parmesan', 'cremerie', 'g', [400, 33, 0, 29], 22, ['dairy'], { aliases: ['parmigiano', 'grana padano', 'queijo parmesão', 'parmesão'], subs: ['emmental'] }),
  ing('mozzarella', 'Mozzarella', 'cremerie', 'g', [250, 18, 1, 19], 10, ['dairy'], { aliases: ['mozza', 'queijo mozzarella'], subs: ['emmental'] }),
  ing('feta', 'Feta', 'cremerie', 'g', [265, 14, 1, 22], 13, ['dairy'], { aliases: ['fromage de brebis'], subs: ['chevre', 'mozzarella'] }),
  ing('chevre', 'Bûche de chèvre', 'cremerie', 'g', [300, 19, 1, 24], 14, ['dairy'], { aliases: ['fromage de chevre', 'chevre frais'], subs: ['feta'] }),

  // Épicerie
  ing('pates', 'Pâtes', 'epicerie', 'g', [355, 12, 70, 1.5], 2, ['gluten'], { aliases: ['spaghetti', 'penne', 'tagliatelles', 'fusilli', 'coquillettes', 'linguine', 'pates', 'massa', 'esparguete'], subs: ['pates-sans-gluten', 'riz'] }),
  ing('pates-sans-gluten', 'Pâtes sans gluten', 'epicerie', 'g', [355, 7, 77, 1.5], 5, [], { aliases: ['pates de riz', 'pates de lentilles'], subs: ['pates'] }),
  ing('nouilles', 'Nouilles de riz', 'epicerie', 'g', [360, 6, 80, 0.6], 6, [], { aliases: ['vermicelles de riz', 'nouilles'], subs: ['pates'] }),
  ing('riz', 'Riz', 'epicerie', 'g', [350, 7, 77, 0.6], 2.5, [], { aliases: ['riz basmati', 'riz long', 'riz thai', 'riz rond', 'riz arborio', 'arroz', 'arroz agulha', 'arroz carolino'], subs: ['quinoa', 'semoule'] }),
  ing('quinoa', 'Quinoa', 'epicerie', 'g', [370, 14, 64, 6], 8, [], { subs: ['riz', 'semoule'] }),
  ing('semoule', 'Semoule', 'epicerie', 'g', [360, 12, 73, 1.5], 2.2, ['gluten'], { aliases: ['couscous', 'semoule de ble'], subs: ['quinoa', 'riz'] }),
  ing('farine', 'Farine de blé', 'epicerie', 'g', [350, 10, 73, 1.2], 1.1, ['gluten'], { density: 0.55, aliases: ['farine', 'farine t55', 'farine t45', 'farinha'], subs: ['maizena'], staple: true }),
  ing('maizena', 'Fécule de maïs', 'epicerie', 'g', [360, 0.3, 88, 0.1], 4, [], { density: 0.6, aliases: ['maizena', 'fecule'], subs: ['farine'] }),
  ing('sucre', 'Sucre', 'epicerie', 'g', [400, 0, 100, 0], 1.3, [], { density: 0.85, aliases: ['sucre en poudre', 'sucre roux', 'cassonade', 'sucre semoule', 'açúcar', 'acucar'], subs: ['miel'], staple: true }),
  ing('miel', 'Miel', 'epicerie', 'g', [320, 0.4, 80, 0], 14, ['honey'], { density: 1.4, aliases: [], subs: ['sucre', 'sirop-erable'] }),
  ing('sirop-erable', "Sirop d'érable", 'epicerie', 'ml', [260, 0, 67, 0], 22, [], { density: 1.3, aliases: ['sirop d erable', 'sirop d agave'], subs: ['miel'] }),
  ing('chocolat', 'Chocolat noir', 'epicerie', 'g', [550, 7, 45, 35], 12, ['dairy'], { aliases: ['chocolat noir', 'chocolat patissier', 'pepites de chocolat', 'chocolate'] }),
  ing('levure', 'Levure chimique', 'epicerie', 'g', [100, 0, 25, 0], 15, [], { aliases: ['levure', 'sachet de levure'] }),
  ing('flocons-avoine', "Flocons d'avoine", 'epicerie', 'g', [370, 13, 60, 7], 2.8, ['gluten'], { aliases: ['flocons d avoine', 'avoine'] }),
  ing('huile-olive', "Huile d'olive", 'epicerie', 'ml', [900, 0, 0, 100], 10, [], { density: 0.92, aliases: ['huile d olive', 'huile', 'azeite'], subs: ['huile-tournesol', 'beurre'], staple: true }),
  ing('huile-tournesol', 'Huile de tournesol', 'epicerie', 'ml', [900, 0, 0, 100], 3, [], { density: 0.92, aliases: ['huile vegetale', 'huile neutre', 'huile de colza'], subs: ['huile-olive'], staple: true }),
  ing('vinaigre', 'Vinaigre balsamique', 'epicerie', 'ml', [90, 0.5, 17, 0], 6, [], { aliases: ['vinaigre', 'vinaigre de vin', 'vinaigre balsamique'], staple: true }),
  ing('moutarde', 'Moutarde', 'epicerie', 'g', [150, 7, 4, 11], 6, ['mustard'], { aliases: ['moutarde de dijon', 'moutarde a l ancienne'] }),
  ing('sauce-soja', 'Sauce soja', 'epicerie', 'ml', [60, 8, 6, 0], 8, ['soy', 'gluten'], { aliases: ['sauce soja salee', 'tamari'] }),
  ing('bouillon', 'Bouillon cube', 'epicerie', 'pc', [250, 10, 20, 15], 25, ['celery'], { pieceG: 10, aliases: ['bouillon de volaille', 'bouillon de legumes', 'cube de bouillon', 'bouillon'] }),
  ing('pain', 'Pain', 'boulangerie', 'g', [270, 9, 53, 1.5], 4.5, ['gluten'], { aliases: ['baguette', 'pain de campagne', 'pain de mie', 'pão', 'pao'], subs: [] }),
  ing('chapelure', 'Chapelure', 'epicerie', 'g', [380, 12, 75, 4], 4, ['gluten'], { aliases: [] }),
  ing('pate-feuilletee', 'Pâte feuilletée', 'cremerie', 'pc', [400, 5, 40, 25], 7, ['gluten', 'dairy'], { pieceG: 230, aliases: ['pate feuilletee', 'pate brisee', 'pate a tarte'] }),
  ing('tortilla', 'Tortillas de blé', 'boulangerie', 'pc', [300, 8, 50, 7], 7, ['gluten'], { pieceG: 40, aliases: ['tortillas', 'wraps', 'galettes de ble'] }),
  ing('pate-pizza', 'Pâte à pizza', 'cremerie', 'pc', [270, 7, 48, 5], 6, ['gluten'], { pieceG: 260, aliases: ['pate a pizza'] }),
  ing('noix', 'Noix', 'epicerie', 'g', [690, 15, 7, 65], 20, ['nuts'], { aliases: ['cerneaux de noix', 'amandes', 'noisettes', 'noix de cajou'] }),
  ing('cacahuete', 'Beurre de cacahuète', 'epicerie', 'g', [600, 25, 15, 50], 10, ['peanut'], { aliases: ['cacahuetes', 'beurre de cacahuete'] }),
  ing('sesame', 'Graines de sésame', 'epicerie', 'g', [570, 18, 12, 50], 12, ['sesame'], { aliases: ['sesame', 'huile de sesame', 'tahini'] }),
  ing('vin-blanc', 'Vin blanc', 'boissons', 'ml', [80, 0, 2.6, 0], 6, ['alcohol'], { aliases: ['vin blanc sec'], subs: ['bouillon'] }),
  ing('vin-rouge', 'Vin rouge', 'boissons', 'ml', [85, 0, 2.6, 0], 6, ['alcohol'], { aliases: ['vin rouge'], subs: ['bouillon'] }),

  // Conserves & légumineuses
  ing('tomates-concassees', 'Tomates concassées', 'conserves', 'g', [25, 1.2, 4, 0.2], 2.6, [], { aliases: ['coulis de tomate', 'tomates pelees', 'passata', 'pulpe de tomate', 'sauce tomate'], subs: ['tomate'] }),
  ing('concentre-tomate', 'Concentré de tomate', 'conserves', 'g', [85, 4, 15, 0.5], 6, [], { aliases: ['concentre de tomates', 'double concentre'] }),
  ing('lait-coco', 'Lait de coco', 'conserves', 'ml', [190, 1.8, 3, 19], 5, [], { aliases: ['lait de coco'], subs: ['creme-coco', 'creme'] }),
  ing('creme-coco', 'Crème de coco', 'conserves', 'ml', [250, 2, 4, 25], 7, [], { aliases: ['creme de coco'], subs: ['lait-coco', 'creme'] }),
  ing('pois-chiches', 'Pois chiches (cuits)', 'conserves', 'g', [140, 7, 18, 2.5], 3.5, [], { aliases: ['pois chiches', 'grão-de-bico', 'grão de bico', 'grão'], subs: ['haricots-rouges', 'lentilles'] }),
  ing('haricots-rouges', 'Haricots rouges (cuits)', 'conserves', 'g', [110, 8, 15, 0.5], 3.2, [], { aliases: ['haricots rouges', 'haricots noirs'], subs: ['pois-chiches'] }),
  ing('lentilles', 'Lentilles corail', 'epicerie', 'g', [340, 24, 50, 1.5], 4, [], { aliases: ['lentilles', 'lentilles vertes', 'lentilles corail'], subs: ['pois-chiches'] }),
  ing('mais', 'Maïs', 'conserves', 'g', [90, 3, 16, 1.2], 4, [], { aliases: ['mais doux'] }),
  ing('petits-pois', 'Petits pois', 'surgeles', 'g', [80, 5, 10, 0.4], 3.5, [], { aliases: ['petits pois'], subs: ['haricots-verts'] }),
  ing('haricots-verts', 'Haricots verts', 'surgeles', 'g', [30, 2, 4, 0.2], 3.8, [], { aliases: ['haricots verts'], subs: ['brocoli'] }),
  ing('tofu', 'Tofu ferme', 'cremerie', 'g', [130, 13, 2, 8], 10, ['soy'], { aliases: ['tofu fume'], subs: ['pois-chiches', 'poulet'] }),
  ing('proteines-soja', 'Protéines de soja texturées', 'epicerie', 'g', [340, 50, 30, 1], 14, ['soy'], { aliases: ['pst', 'hache vegetal'], subs: ['lentilles', 'boeuf-hache'] }),

  // Épices (fond de placard)
  ing('sel', 'Sel', 'epices', 'g', [0, 0, 0, 0], 1, [], { aliases: ['sel fin', 'gros sel', 'fleur de sel'], staple: true }),
  ing('poivre', 'Poivre', 'epices', 'g', [250, 10, 60, 3], 40, [], { aliases: ['poivre noir', 'poivre du moulin'], staple: true }),
  ing('cumin', 'Cumin', 'epices', 'g', [375, 18, 44, 22], 30, [], { aliases: [] , staple: true }),
  ing('paprika', 'Paprika', 'epices', 'g', [280, 14, 54, 13], 30, [], { aliases: ['paprika fume', 'piment doux'], staple: true }),
  ing('curry', 'Curry en poudre', 'epices', 'g', [325, 14, 55, 14], 30, [], { aliases: ['curry', 'pate de curry', 'garam masala'], staple: true }),
  ing('herbes-provence', 'Herbes de Provence', 'epices', 'g', [260, 9, 60, 7], 35, [], { aliases: ['thym', 'romarin', 'origan', 'laurier', 'herbes de provence', 'ervas de provence', 'ervas da provenca'], staple: true }),
  ing('cannelle', 'Cannelle', 'epices', 'g', [250, 4, 80, 1], 35, [], { aliases: [], staple: true }),
  ing('piment', 'Piment', 'epices', 'g', [300, 12, 50, 14], 40, [], { aliases: ['piment d espelette', 'piment de cayenne', 'flocons de piment', 'piri-piri', 'piripiri', 'malagueta'], staple: true }),
  ing('vanille', 'Sucre vanillé', 'epices', 'g', [400, 0, 100, 0], 12, [], { aliases: ['extrait de vanille', 'sucre vanille', 'vanille'] }),
  // Épices et herbes ajoutées (prix moyens au kilo ; une « dose » de safran pèse 0,1 g)
  ing('safran', 'Safran', 'epices', 'g', [310, 11, 65, 6], 10000, [], { pieceG: 0.1, aliases: ['dose de safran', 'pistils de safran', 'açafrão', 'acafrao', 'saffron'], staple: true }),
  ing('muscade', 'Muscade', 'epices', 'g', [525, 6, 49, 36], 45, [], { aliases: ['noix de muscade', 'muscade moulue', 'noz-moscada', 'noz moscada'], staple: true }),
  ing('curcuma', 'Curcuma', 'epices', 'g', [312, 10, 67, 3], 30, [], { aliases: ['curcuma en poudre', 'açafrão-da-índia', 'acafrao-da-india', 'turmeric'], staple: true }),
  ing('girofle', 'Clous de girofle', 'epices', 'g', [274, 6, 66, 13], 60, [], { pieceG: 0.1, aliases: ['clou de girofle', 'clous de girofle', 'cravinho', 'cravinhos', 'cravinho-da-índia'], staple: true }),
  ing('laurier', 'Laurier', 'epices', 'g', [313, 8, 75, 8], 40, [], { pieceG: 0.2, aliases: ['feuille de laurier', 'feuilles de laurier', 'louro', 'folha de louro', 'folhas de louro'], staple: true }),
  ing('thym', 'Thym', 'epices', 'g', [276, 9, 64, 7], 40, [], { aliases: ['thym frais', 'thym séché', 'tomilho'], staple: true }),
  ing('bouquet-garni', 'Bouquet garni', 'epices', 'pc', [0, 0, 0, 0], 60, [], { pieceG: 10, aliases: ['bouquet garni', 'bouquets garnis', 'garni'], staple: true }),
  ing('menthe', 'Menthe', 'fruits-legumes', 'g', [44, 3.8, 5, 0.7], 30, [], { aliases: ['menthe fraîche', 'feuilles de menthe', 'hortelã', 'hortela', 'raminho de hortelã'], subs: ['basilic'] }),
  ing('gelatine', 'Gélatine', 'epicerie', 'pc', [335, 85, 0, 0], 80, [], { pieceG: 2, aliases: ['feuille de gélatine', 'feuilles de gélatine', 'gélatine', 'folha de gelatina', 'folhas de gelatina', 'gelatina'] }),
  ing('eau', 'Eau', 'boissons', 'ml', [0, 0, 0, 0], 0, [], { aliases: ["d'eau", 'eau', 'eau tiède', 'eau froide', 'eau chaude', 'água', 'agua'], staple: true }),
];

export const INGREDIENT_BY_ID: Record<string, Ingredient> = Object.fromEntries(INGREDIENTS.map((i) => [i.id, i]));

/** Résolveur des ingrédients du dictionnaire multilingue ("lex:artichoke"), branché par lib/lexicon.ts. */
let lexResolver: ((id: string) => Ingredient | undefined) | null = null;
export function registerLexiconResolver(fn: (id: string) => Ingredient | undefined) {
  lexResolver = fn;
}

/** Produits créés par l'utilisateur ("mine:…"), fournis par l'état de l'app. */
const CUSTOM = new Map<string, Ingredient>();
export function setCustomIngredients(list: Ingredient[]) {
  CUSTOM.clear();
  for (const i of list) CUSTOM.set(i.id, i);
}
export function customIngredients(): Ingredient[] {
  return [...CUSTOM.values()];
}

export function getIngredient(id: string | undefined): Ingredient | undefined {
  if (!id) return undefined;
  if (id.startsWith('mine:')) return CUSTOM.get(id);
  const own = INGREDIENT_BY_ID[id];
  if (own || !id.startsWith('lex:')) return own;
  // Dictionnaire pas encore chargé (hors-ligne, premier affichage) : on fabrique l'ingrédient depuis son identifiant.
  const slug = id.slice(4);
  return (
    lexResolver?.(slug) ?? {
      id, name: slug.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()), aliases: [], aisle: 'divers', unit: 'g',
      kcal: 0, protein: 0, carbs: 0, fat: 0, pricePerKg: 0, tags: [], partial: true,
    }
  );
}

export const AISLE_LABELS: Record<Aisle, { label: string; emoji: string; order: number }> = {
  'fruits-legumes': { label: 'Fruits & légumes', emoji: '🥬', order: 1 },
  boulangerie: { label: 'Boulangerie', emoji: '🥖', order: 2 },
  boucherie: { label: 'Boucherie & charcuterie', emoji: '🥩', order: 3 },
  poissonnerie: { label: 'Poissonnerie', emoji: '🐟', order: 4 },
  cremerie: { label: 'Crèmerie & frais', emoji: '🧀', order: 5 },
  epicerie: { label: 'Épicerie', emoji: '🥫', order: 6 },
  conserves: { label: 'Conserves & légumineuses', emoji: '🥫', order: 7 },
  epices: { label: 'Épices & condiments', emoji: '🧂', order: 8 },
  surgeles: { label: 'Surgelés', emoji: '🧊', order: 9 },
  boissons: { label: 'Boissons', emoji: '🍷', order: 10 },
  divers: { label: 'Divers', emoji: '🛒', order: 11 },
};
