import type { Recipe } from '../../types/project73';
import { ingredientMap } from './ingredients';

/**
 * Built-in recipes. Amounts are per serving in the ingredient's unit (raw/dry weight).
 * Nutrition is never stored here: it is always calculated from the ingredient data.
 */
const recipeData: Recipe[] = [
  // Ontbijt
  {
    id: 'kwark_havermout_aardbei', name: 'Kwarkbowl met havermout, aardbeien en whey', slots: ['breakfast'], prepMinutes: 4, totalMinutes: 4, method: 'no_cook', batchFriendly: false, source: 'builtin', tags: ['eiwitrijk', 'snel'],
    ingredients: [{ ingredientId: 'magere_kwark', amount: 250 }, { ingredientId: 'havermout', amount: 40 }, { ingredientId: 'aardbeien', amount: 100 }, { ingredientId: 'whey', amount: 15 }],
    steps: ['Roer de whey door de kwark.', 'Schep de havermout erdoor.', 'Snijd de aardbeien en leg ze erop.'],
  },
  {
    id: 'roerei_volkorenbrood', name: 'Roerei met volkorenbrood en tomaat', slots: ['breakfast', 'lunch'], prepMinutes: 8, totalMinutes: 8, method: 'pan', batchFriendly: false, source: 'builtin', tags: ['warm', 'eieren'],
    ingredients: [{ ingredientId: 'eieren', amount: 3 }, { ingredientId: 'volkorenbrood', amount: 2 }, { ingredientId: 'tomaat', amount: 100 }, { ingredientId: 'olijfolie', amount: 2 }],
    steps: ['Klop de eieren los met peper en zout.', 'Bak ze 3–4 minuten roerend in een pan met een paar druppels olie.', 'Serveer op het brood met plakjes tomaat.'],
  },
  {
    id: 'overnight_oats_skyr', name: 'Overnight oats met skyr en blauwe bessen', slots: ['breakfast'], prepMinutes: 3, totalMinutes: 3, method: 'no_cook', batchFriendly: true, source: 'builtin', tags: ['voorbereiden', 'eiwitrijk'],
    ingredients: [{ ingredientId: 'havermout', amount: 50 }, { ingredientId: 'skyr', amount: 200 }, { ingredientId: 'halfvolle_melk', amount: 100 }, { ingredientId: 'blauwe_bessen', amount: 75 }],
    steps: ['Meng havermout, skyr en melk in een bakje.', 'Zet het afgedekt een nacht in de koelkast.', 'Leg de bessen er ’s ochtends op.'],
  },
  {
    id: 'skyr_banaan_havermout', name: 'Skyr met banaan en havermout', slots: ['breakfast'], prepMinutes: 3, totalMinutes: 3, method: 'no_cook', batchFriendly: false, source: 'builtin', tags: ['snel', 'eiwitrijk'],
    ingredients: [{ ingredientId: 'skyr', amount: 250 }, { ingredientId: 'banaan', amount: 1 }, { ingredientId: 'havermout', amount: 30 }],
    steps: ['Schep de skyr in een kom.', 'Snijd de banaan in plakjes.', 'Strooi de havermout erover.'],
  },
  {
    id: 'omelet_wrap_spinazie', name: 'Omeletwrap met spinazie en kaas', slots: ['breakfast', 'lunch'], prepMinutes: 8, totalMinutes: 8, method: 'pan', batchFriendly: false, source: 'builtin', tags: ['warm', 'eieren'],
    ingredients: [{ ingredientId: 'eieren', amount: 2 }, { ingredientId: 'volkoren_wraps', amount: 1 }, { ingredientId: 'spinazie', amount: 50 }, { ingredientId: 'kaas_30', amount: 20 }],
    steps: ['Klop de eieren los en bak er een dunne omelet van.', 'Leg de wrap op de omelet zodat hij vastplakt en draai om.', 'Beleg met spinazie en kaas, rol op en snijd doormidden.'],
  },
  {
    id: 'kwark_appel_kaneel', name: 'Kwark met appel en havermout', slots: ['breakfast', 'snack'], prepMinutes: 3, totalMinutes: 3, method: 'no_cook', batchFriendly: false, source: 'builtin', tags: ['snel'],
    ingredients: [{ ingredientId: 'magere_kwark', amount: 250 }, { ingredientId: 'appel', amount: 1 }, { ingredientId: 'havermout', amount: 25 }],
    steps: ['Rasp of snijd de appel.', 'Meng met de kwark en havermout. Eventueel kaneel erover.'],
  },

  // Lunch
  {
    id: 'kipwraps_tzatziki', name: 'Volkoren kipwraps met groente en tzatziki', slots: ['lunch'], prepMinutes: 12, totalMinutes: 15, method: 'pan', batchFriendly: false, source: 'builtin', tags: ['eiwitrijk'],
    ingredients: [{ ingredientId: 'volkoren_wraps', amount: 2 }, { ingredientId: 'kipfilet', amount: 125 }, { ingredientId: 'komkommer', amount: 75 }, { ingredientId: 'tomaat', amount: 75 }, { ingredientId: 'sla', amount: 25 }, { ingredientId: 'tzatziki', amount: 40 }, { ingredientId: 'kruiden', amount: 2 }],
    steps: ['Snijd de kip in reepjes, bestrooi met kruiden en bak 6–7 minuten gaar.', 'Snijd komkommer en tomaat.', 'Besmeer de wraps met tzatziki, vul met sla, groente en kip en rol op.'],
  },
  {
    id: 'tonijn_ei_salade', name: 'Eiwitrijke salade met tonijn en ei', slots: ['lunch'], prepMinutes: 10, totalMinutes: 12, method: 'stovetop', batchFriendly: false, source: 'builtin', tags: ['eiwitrijk', 'licht'],
    ingredients: [{ ingredientId: 'tonijn', amount: 110 }, { ingredientId: 'eieren', amount: 2 }, { ingredientId: 'sla', amount: 75 }, { ingredientId: 'komkommer', amount: 100 }, { ingredientId: 'tomaat', amount: 100 }, { ingredientId: 'mais', amount: 50 }, { ingredientId: 'olijfolie', amount: 5 }],
    steps: ['Kook de eieren 8 minuten en laat ze schrikken in koud water.', 'Snijd komkommer en tomaat en meng met sla en maïs.', 'Verdeel de tonijn en gehalveerde eieren erover en besprenkel met olie.'],
  },
  {
    id: 'brood_hummus_kip', name: 'Volkorenbrood met hummus, kip en komkommer', slots: ['lunch'], prepMinutes: 5, totalMinutes: 5, method: 'no_cook', batchFriendly: false, source: 'builtin', tags: ['snel'],
    ingredients: [{ ingredientId: 'volkorenbrood', amount: 3 }, { ingredientId: 'hummus', amount: 40 }, { ingredientId: 'kipfilet', amount: 100 }, { ingredientId: 'komkommer', amount: 100 }],
    steps: ['Gebruik gegaarde kip van een eerder diner, of bak 100 g kipfilet 6–7 minuten.', 'Besmeer het brood met hummus.', 'Beleg met kip en plakjes komkommer.'],
  },
  {
    id: 'kip_rijst_bowl', name: 'Kip-rijstbowl met bimi en sojasaus', slots: ['lunch', 'dinner'], prepMinutes: 10, totalMinutes: 20, method: 'airfryer', batchFriendly: true, source: 'builtin', tags: ['meal-prep', 'eiwitrijk'],
    ingredients: [{ ingredientId: 'kipfilet', amount: 150 }, { ingredientId: 'rijst', amount: 70 }, { ingredientId: 'bimi', amount: 150 }, { ingredientId: 'sojasaus', amount: 10 }],
    steps: ['Kook de rijst volgens de verpakking.', 'Gaar de kip met wat kruiden 12–14 minuten in de airfryer op 200 °C.', 'Roerbak of stoom de bimi 4 minuten en serveer alles met sojasaus.'],
  },
  {
    id: 'cottage_wrap_kip', name: 'Wrap met cottage cheese, kip en paprika', slots: ['lunch'], prepMinutes: 6, totalMinutes: 6, method: 'no_cook', batchFriendly: false, source: 'builtin', tags: ['snel', 'eiwitrijk'],
    ingredients: [{ ingredientId: 'volkoren_wraps', amount: 2 }, { ingredientId: 'cottage_cheese', amount: 100 }, { ingredientId: 'kipfilet', amount: 100 }, { ingredientId: 'paprika', amount: 80 }, { ingredientId: 'sla', amount: 25 }],
    steps: ['Gebruik gegaarde kip van een eerder diner, of bak 100 g kipfilet 6–7 minuten.', 'Smeer cottage cheese op de wraps.', 'Vul met kip, paprikareepjes en sla en rol op.'],
  },

  // Diner
  {
    id: 'zalm_krieltjes_broccoli', name: 'Zalm uit de oven met krieltjes en broccoli', slots: ['dinner'], prepMinutes: 8, totalMinutes: 30, method: 'oven', batchFriendly: false, source: 'builtin', tags: ['oven', 'één bakplaat'],
    ingredients: [{ ingredientId: 'zalmfilet', amount: 125 }, { ingredientId: 'krieltjes', amount: 250 }, { ingredientId: 'broccoli', amount: 200 }, { ingredientId: 'olijfolie', amount: 5 }, { ingredientId: 'kruiden', amount: 2 }],
    steps: ['Verwarm de oven voor op 200 °C.', 'Halveer de krieltjes, meng met olie en kruiden en bak 15 minuten.', 'Leg zalm en broccoliroosjes erbij en bak nog 12–15 minuten.'],
  },
  {
    id: 'gehakt_rijst_wokgroente', name: 'Mager gehakt met rijst en wokgroenten', slots: ['dinner'], prepMinutes: 12, totalMinutes: 18, method: 'pan', batchFriendly: true, source: 'builtin', tags: ['pan', 'meal-prep'],
    ingredients: [{ ingredientId: 'rundergehakt', amount: 125 }, { ingredientId: 'rijst', amount: 70 }, { ingredientId: 'wokgroente', amount: 200 }, { ingredientId: 'sojasaus', amount: 10 }, { ingredientId: 'knoflook', amount: 3 }],
    steps: ['Kook de rijst volgens de verpakking.', 'Bak het gehakt rul met de knoflook.', 'Voeg de wokgroenten toe, roerbak 5 minuten en blus af met sojasaus.'],
  },
  {
    id: 'pasta_kip_tomaat', name: 'Volkoren pasta met kip en tomatensaus', slots: ['dinner'], prepMinutes: 12, totalMinutes: 18, method: 'pan', batchFriendly: true, source: 'builtin', tags: ['pan', 'meal-prep'],
    ingredients: [{ ingredientId: 'volkoren_pasta', amount: 80 }, { ingredientId: 'kipfilet', amount: 125 }, { ingredientId: 'passata', amount: 150 }, { ingredientId: 'ui', amount: 50 }, { ingredientId: 'paprika', amount: 100 }, { ingredientId: 'olijfolie', amount: 5 }, { ingredientId: 'kruiden', amount: 2 }],
    steps: ['Kook de pasta volgens de verpakking.', 'Bak ui, paprika en kipblokjes 7 minuten in de olie.', 'Voeg passata en kruiden toe, laat 5 minuten pruttelen en meng met de pasta.'],
  },
  {
    id: 'airfryer_kip_bimi', name: 'Airfryer-kip met rijst en bimi', slots: ['dinner'], prepMinutes: 6, totalMinutes: 20, method: 'airfryer', batchFriendly: true, source: 'builtin', tags: ['airfryer', 'eiwitrijk'],
    ingredients: [{ ingredientId: 'kipfilet', amount: 150 }, { ingredientId: 'rijst', amount: 75 }, { ingredientId: 'bimi', amount: 150 }, { ingredientId: 'olijfolie', amount: 3 }, { ingredientId: 'kruiden', amount: 2 }],
    steps: ['Kook de rijst volgens de verpakking.', 'Bestrijk de kip met olie en kruiden en gaar 14 minuten in de airfryer op 200 °C.', 'Leg de bimi de laatste 5 minuten erbij.'],
  },
  {
    id: 'kip_traybake', name: 'Kip-traybake met aardappel en paprika', slots: ['dinner'], prepMinutes: 10, totalMinutes: 35, method: 'oven', batchFriendly: true, source: 'builtin', tags: ['oven', 'één bakplaat'],
    ingredients: [{ ingredientId: 'kipfilet', amount: 150 }, { ingredientId: 'krieltjes', amount: 250 }, { ingredientId: 'paprika', amount: 150 }, { ingredientId: 'ui', amount: 75 }, { ingredientId: 'olijfolie', amount: 7 }, { ingredientId: 'kruiden', amount: 3 }],
    steps: ['Verwarm de oven voor op 200 °C.', 'Snijd aardappel, paprika, ui en kip in stukken en meng met olie en kruiden.', 'Rooster alles 25–30 minuten op één bakplaat.'],
  },
  {
    id: 'chili_light', name: 'Chili con carne light met rijst', slots: ['dinner'], prepMinutes: 15, totalMinutes: 25, method: 'pan', batchFriendly: true, source: 'builtin', tags: ['meal-prep', 'vezelrijk'],
    ingredients: [{ ingredientId: 'rundergehakt', amount: 125 }, { ingredientId: 'kidneybonen', amount: 100 }, { ingredientId: 'passata', amount: 150 }, { ingredientId: 'paprika', amount: 100 }, { ingredientId: 'ui', amount: 50 }, { ingredientId: 'rijst', amount: 60 }, { ingredientId: 'kruiden', amount: 3 }],
    steps: ['Kook de rijst volgens de verpakking.', 'Bak ui en gehakt rul, voeg paprika en kruiden toe.', 'Voeg passata en uitgelekte bonen toe en laat 10 minuten zachtjes koken.'],
  },
  {
    id: 'zalm_rijst_sperzie', name: 'Zalm met rijst en sperziebonen', slots: ['dinner'], prepMinutes: 8, totalMinutes: 20, method: 'airfryer', batchFriendly: false, source: 'builtin', tags: ['airfryer'],
    ingredients: [{ ingredientId: 'zalmfilet', amount: 125 }, { ingredientId: 'rijst', amount: 70 }, { ingredientId: 'sperziebonen', amount: 200 }, { ingredientId: 'sojasaus', amount: 5 }],
    steps: ['Kook de rijst en de sperziebonen (6–8 minuten).', 'Gaar de zalm 10–12 minuten in de airfryer op 180 °C.', 'Serveer met een scheutje sojasaus.'],
  },
  {
    id: 'ovenfrittata', name: 'Ovenfrittata met groente en kaas', slots: ['dinner', 'lunch'], prepMinutes: 10, totalMinutes: 30, method: 'oven', batchFriendly: true, source: 'builtin', tags: ['vegetarisch', 'oven'],
    ingredients: [{ ingredientId: 'eieren', amount: 4 }, { ingredientId: 'paprika', amount: 100 }, { ingredientId: 'spinazie', amount: 75 }, { ingredientId: 'kaas_30', amount: 25 }, { ingredientId: 'volkorenbrood', amount: 2 }],
    steps: ['Verwarm de oven voor op 190 °C.', 'Klop de eieren los en meng met paprika, spinazie en kaas.', 'Bak 20 minuten in een ovenschaal. Eet met het brood.'],
  },
  {
    id: 'burrito_bowl', name: 'Burritowraps met gehakt, bonen en maïs', slots: ['dinner'], prepMinutes: 15, totalMinutes: 18, method: 'pan', batchFriendly: false, source: 'builtin', tags: ['pan'],
    ingredients: [{ ingredientId: 'volkoren_wraps', amount: 2 }, { ingredientId: 'rundergehakt', amount: 100 }, { ingredientId: 'kidneybonen', amount: 60 }, { ingredientId: 'mais', amount: 40 }, { ingredientId: 'paprika', amount: 75 }, { ingredientId: 'tzatziki', amount: 30 }, { ingredientId: 'kruiden', amount: 3 }],
    steps: ['Bak het gehakt rul met kruiden.', 'Voeg paprika, bonen en maïs toe en warm 4 minuten mee.', 'Vul de wraps en serveer met tzatziki.'],
  },
  {
    id: 'zoete_aardappel_kip', name: 'Zoete aardappel met kip en broccoli uit de oven', slots: ['dinner'], prepMinutes: 8, totalMinutes: 30, method: 'oven', batchFriendly: true, source: 'builtin', tags: ['oven', 'één bakplaat'],
    ingredients: [{ ingredientId: 'kipfilet', amount: 150 }, { ingredientId: 'zoete_aardappel', amount: 200 }, { ingredientId: 'broccoli', amount: 200 }, { ingredientId: 'olijfolie', amount: 5 }, { ingredientId: 'kruiden', amount: 2 }],
    steps: ['Verwarm de oven voor op 200 °C.', 'Snijd zoete aardappel in blokjes en bak 10 minuten met olie en kruiden.', 'Voeg kip en broccoli toe en bak nog 15–18 minuten.'],
  },

  // Tussendoor
  {
    id: 'skyr_bessen', name: 'Skyr met blauwe bessen', slots: ['snack'], prepMinutes: 1, totalMinutes: 1, method: 'no_cook', batchFriendly: false, source: 'builtin', tags: ['eiwitrijk'],
    ingredients: [{ ingredientId: 'skyr', amount: 200 }, { ingredientId: 'blauwe_bessen', amount: 50 }],
    steps: ['Schep de skyr in een kom en leg de bessen erop.'],
  },
  {
    id: 'appel_snack', name: 'Appel', slots: ['snack'], prepMinutes: 0, totalMinutes: 0, method: 'no_cook', batchFriendly: false, source: 'builtin', tags: ['fruit'],
    ingredients: [{ ingredientId: 'appel', amount: 1 }],
    steps: ['Was de appel en eet hem zo op.'],
  },
  {
    id: 'banaan_snack', name: 'Banaan', slots: ['snack'], prepMinutes: 0, totalMinutes: 0, method: 'no_cook', batchFriendly: false, source: 'builtin', tags: ['fruit'],
    ingredients: [{ ingredientId: 'banaan', amount: 1 }],
    steps: ['Pellen en eten.'],
  },
  {
    id: 'cottage_komkommer', name: 'Cottage cheese met komkommer', slots: ['snack'], prepMinutes: 2, totalMinutes: 2, method: 'no_cook', batchFriendly: false, source: 'builtin', tags: ['eiwitrijk'],
    ingredients: [{ ingredientId: 'cottage_cheese', amount: 150 }, { ingredientId: 'komkommer', amount: 100 }],
    steps: ['Snijd de komkommer in stukjes en eet met de cottage cheese.'],
  },
  {
    id: 'eiwitshake', name: 'Eiwitshake met melk', slots: ['snack'], prepMinutes: 1, totalMinutes: 1, method: 'no_cook', batchFriendly: false, source: 'builtin', tags: ['eiwitrijk', 'snel'],
    ingredients: [{ ingredientId: 'whey', amount: 30 }, { ingredientId: 'halfvolle_melk', amount: 250 }],
    steps: ['Schud de whey met de melk in een shaker.'],
  },
  {
    id: 'hummus_groente', name: 'Hummus met komkommer en paprika', slots: ['snack'], prepMinutes: 3, totalMinutes: 3, method: 'no_cook', batchFriendly: false, source: 'builtin', tags: ['groente'],
    ingredients: [{ ingredientId: 'hummus', amount: 40 }, { ingredientId: 'komkommer', amount: 100 }, { ingredientId: 'paprika', amount: 80 }],
    steps: ['Snijd komkommer en paprika in staafjes en dip in de hummus.'],
  },
  {
    id: 'kwark_aardbei_snack', name: 'Magere kwark met aardbeien', slots: ['snack'], prepMinutes: 2, totalMinutes: 2, method: 'no_cook', batchFriendly: false, source: 'builtin', tags: ['eiwitrijk'],
    ingredients: [{ ingredientId: 'magere_kwark', amount: 200 }, { ingredientId: 'aardbeien', amount: 100 }],
    steps: ['Snijd de aardbeien en meng met de kwark.'],
  },
  {
    id: 'gekookte_eieren', name: 'Twee gekookte eieren', slots: ['snack'], prepMinutes: 2, totalMinutes: 10, method: 'stovetop', batchFriendly: true, source: 'builtin', tags: ['eiwitrijk'],
    ingredients: [{ ingredientId: 'eieren', amount: 2 }],
    steps: ['Kook de eieren 8 minuten. Kook er gerust meer tegelijk; ze blijven 3 dagen goed in de koelkast.'],
  },
];

export const builtinRecipes: Recipe[] = recipeData.map((recipe) => ({ ...recipe, source: 'builtin', image: recipe.image ?? ingredientMap.get(recipe.ingredients[0].ingredientId)?.image }));
