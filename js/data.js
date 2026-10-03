'use strict';
/* =====================================================================
   КЛЁВОЕ МЕСТО — игровые данные: рыбы, водоёмы, снасти, наживки,
   приманки, прикормки, снаряжение, достижения, задания, погода.
   ===================================================================== */

const GAME_NAME = 'klevoe_mesto_fishing';
const SAVE_KEY = 'klevoe_mesto_save_v1';
const SHARE_LINK = 'https://max.ru/channel_igroteka_max';
const MAX_LEVEL = 30;

/* ---------- слои воды: где находится насадка/приманка ---------- */
const LAYERS = ['surface', 'mid', 'bottom'];
const LAYER_NAMES = { surface: 'у поверхности', mid: 'в толще', bottom: 'у дна' };

/* ---------- время суток ---------- */
const TOD_NAMES = { dawn: 'Рассвет', day: 'День', dusk: 'Закат', night: 'Ночь' };

/* ---------- виды рыб ---------- */
/* min/max — кг; trophy — трофейный вес; price — ₽ за кг; pow — сила рывка на кг веса;
   stam — выносливость; mouth — размер рта (1..5, для подбора крючка); wary — осторожность
   (чувствительна к толстой леске); layer — где держится; depth — любимая глубина, м;
   tod — активность по времени суток; baits/lures — насадки и приманки (вес = привлекательность);
   style — манера вываживания; xp — множитель опыта. */
const SPECIES = {
  karas:      { name: 'Карась золотой', min: 0.05, max: 1.6, trophy: 1.0, price: 90, pow: 1.3, stam: 1.0, mouth: 2, wary: 0.3, layer: 'bottom', depth: [0.4, 3], tod: { dawn: 1.3, day: 0.9, dusk: 1.2, night: 0.6 }, baits: { worm: 0.8, maggot: 0.9, bloodworm: 1, bread: 0.8, dough: 1, corn: 0.6, barley: 0.7, pea: 0.4 }, lures: {}, style: 'steady', xp: 1, desc: 'Неприхотливый житель тихих прудов. Любит тесто и мотыля, клюёт осторожно — поплавок медленно ведёт в сторону.' },
  serkaras:   { name: 'Карась серебряный', min: 0.05, max: 2.2, trophy: 1.3, price: 80, pow: 1.4, stam: 1.0, mouth: 2, wary: 0.2, layer: 'bottom', depth: [0.5, 3.5], tod: { dawn: 1.3, day: 1, dusk: 1.2, night: 0.6 }, baits: { worm: 0.9, maggot: 0.8, bloodworm: 0.9, bread: 1, dough: 1, corn: 0.6, barley: 0.6, pea: 0.5 }, lures: {}, style: 'steady', xp: 1, desc: 'Крепче и быстрее золотого родича. Отлично ловится на хлеб и тесто, держится у дна.' },
  rotan:      { name: 'Ротан', min: 0.02, max: 0.5, trophy: 0.35, price: 40, pow: 1.1, stam: 0.8, mouth: 3, wary: 0.05, layer: 'bottom', depth: [0.3, 2.5], tod: { dawn: 1, day: 1, dusk: 1, night: 1 }, baits: { worm: 1, bigworm: 0.8, maggot: 0.7, bloodworm: 0.7, livebait: 0.4 }, lures: { twister: 0.5, spinner_s: 0.3 }, style: 'steady', xp: 0.7, desc: 'Прожорливый головастик, хватает всё подряд. Мелкий, но всегда выручит, когда клёва нет.' },
  plotva:     { name: 'Плотва', min: 0.03, max: 1.2, trophy: 0.6, price: 110, pow: 1.4, stam: 0.9, mouth: 1, wary: 0.45, layer: 'mid', depth: [0.8, 4], tod: { dawn: 1.2, day: 1, dusk: 1.2, night: 0.4 }, baits: { maggot: 1, bloodworm: 1, bread: 0.6, dough: 0.7, barley: 0.8, pea: 0.5, worm: 0.5, caddis: 0.6 }, lures: {}, style: 'steady', xp: 1, desc: 'Серебристая рыба с красными глазами и плавниками. Любит опарыша и перловку, держится в толще воды.' },
  krasnoperka:{ name: 'Краснопёрка', min: 0.03, max: 0.9, trophy: 0.5, price: 100, pow: 1.4, stam: 0.9, mouth: 1, wary: 0.4, layer: 'surface', depth: [0.3, 2.5], tod: { dawn: 1, day: 1.2, dusk: 1.1, night: 0.3 }, baits: { bread: 1, maggot: 0.9, dough: 0.8, grasshopper: 0.6, corn: 0.3 }, lures: {}, style: 'steady', xp: 1.1, desc: 'Золотистая рыбка с алыми плавниками. Кормится у поверхности, обожает хлеб и кузнечика.' },
  okun:       { name: 'Окунь', min: 0.03, max: 2.5, trophy: 1.2, price: 160, pow: 1.6, stam: 1.0, mouth: 3, wary: 0.25, layer: 'mid', depth: [1, 6], tod: { dawn: 1.3, day: 1.1, dusk: 1, night: 0.2 }, baits: { worm: 1, bigworm: 0.8, maggot: 0.5, bloodworm: 0.5, livebait: 0.9 }, lures: { spinner_s: 1, spinner_l: 0.5, spoon: 0.6, twister: 1, vibro: 0.8, crank: 0.7, popper: 0.4, wobbler: 0.5 }, style: 'zigzag', xp: 1.1, desc: 'Полосатый разбойник. Охотится стаей, бросается на вертушку и червя. Крупный «горбач» — гордость рыбака.' },
  lin:        { name: 'Линь', min: 0.2, max: 4, trophy: 2.2, price: 220, pow: 1.7, stam: 1.3, mouth: 3, wary: 0.5, layer: 'bottom', depth: [0.5, 3], tod: { dawn: 1.4, day: 0.6, dusk: 1.3, night: 0.8 }, baits: { worm: 1, bigworm: 0.7, maggot: 0.6, bloodworm: 0.8, dough: 0.5, corn: 0.5, caddis: 0.6 }, lures: {}, style: 'bottom', xp: 1.5, desc: 'Тёмно-оливковый житель заросших заводей. Упрямо сопротивляется и уходит в траву.' },
  karp:       { name: 'Карп', min: 0.5, max: 20, trophy: 10, price: 180, pow: 1.9, stam: 1.4, mouth: 4, wary: 0.6, layer: 'bottom', depth: [1, 6], tod: { dawn: 1.4, day: 0.7, dusk: 1.2, night: 1 }, baits: { corn: 1, boilie: 1.2, dough: 0.8, pea: 0.8, barley: 0.6, worm: 0.4, bread: 0.4 }, lures: {}, style: 'runner', xp: 1.6, desc: 'Сильный и хитрый. Мощные потяжки сматывают леску с катушки — держи фрикцион под контролем!' },
  zolotaya:   { name: 'Золотая рыбка', min: 0.1, max: 0.4, trophy: 0.3, price: 0, fixed: 25000, pow: 1.5, stam: 1.2, mouth: 2, wary: 0.9, layer: 'mid', depth: [0.5, 3], tod: { dawn: 1, day: 1.5, dusk: 1, night: 0.5 }, baits: { bread: 1, dough: 1, maggot: 0.6, bloodworm: 0.8 }, lures: {}, style: 'steady', xp: 30, legend: true, desc: 'Легенда деревенского пруда. Говорят, исполняет желания. Скупщик отдаст за неё целое состояние.' },
  golavl:     { name: 'Голавль', min: 0.1, max: 4, trophy: 2.2, price: 170, pow: 1.8, stam: 1.2, mouth: 4, wary: 0.7, layer: 'surface', depth: [0.5, 3], tod: { dawn: 1.2, day: 1.1, dusk: 1.2, night: 0.4 }, baits: { grasshopper: 1.2, bread: 0.6, maggot: 0.5, worm: 0.5, crayfish: 0.7, caddis: 0.6 }, lures: { spinner_s: 0.9, wobbler: 1, popper: 0.9, fly: 0.9 }, style: 'runner', xp: 1.4, desc: 'Лобастый и осторожный. Подбирает упавших в воду насекомых, хватает воблер у поверхности.' },
  yaz:        { name: 'Язь', min: 0.1, max: 3, trophy: 1.8, price: 160, pow: 1.7, stam: 1.1, mouth: 3, wary: 0.55, layer: 'mid', depth: [1, 4], tod: { dawn: 1.3, day: 0.9, dusk: 1.3, night: 0.6 }, baits: { worm: 0.9, pea: 1, bread: 0.6, maggot: 0.6, grasshopper: 0.7, caddis: 0.8 }, lures: { spinner_s: 0.6, fly: 0.6 }, style: 'runner', xp: 1.3, desc: 'Красавец с медными боками. Отлично берёт на горох и ручейника на течении.' },
  shchuka:    { name: 'Щука', min: 0.4, max: 16, trophy: 7, price: 140, pow: 1.4, stam: 1.1, mouth: 5, wary: 0.3, layer: 'mid', depth: [0.8, 5], tod: { dawn: 1.3, day: 1, dusk: 1.3, night: 0.3 }, baits: { livebait: 1.2, frog: 0.7 }, lures: { spoon: 1, spinner_l: 1, wobbler: 1, vibro: 0.8, vibro_big: 0.9, popper: 0.6, crank: 0.6, twister: 0.4 }, style: 'runner', xp: 1.4, desc: 'Пятнистая хищница из засады. Хватает блесну и воблер, острые зубы легко режут тонкую леску.' },
  leshch:     { name: 'Лещ', min: 0.2, max: 6, trophy: 3.5, price: 140, pow: 1.3, stam: 1.0, mouth: 3, wary: 0.55, layer: 'bottom', depth: [2.5, 12], tod: { dawn: 1.2, day: 0.6, dusk: 1.3, night: 1.4 }, baits: { worm: 0.8, maggot: 0.8, bloodworm: 0.9, pea: 0.7, barley: 0.8, corn: 0.6, dough: 0.6, shell: 0.5 }, lures: {}, style: 'steady', xp: 1.3, desc: 'Широкий, как лопата. Стаи кормятся на глубине — фидер с прикормкой лучший способ его поймать.' },
  peskar:     { name: 'Пескарь', min: 0.01, max: 0.15, trophy: 0.1, price: 60, pow: 1.1, stam: 0.7, mouth: 1, wary: 0.1, layer: 'bottom', depth: [0.3, 2], tod: { dawn: 1, day: 1.2, dusk: 1, night: 0.2 }, baits: { bloodworm: 1, maggot: 0.8, worm: 0.8 }, lures: {}, style: 'steady', xp: 0.6, desc: 'Усатый малыш песчаных перекатов. Клюёт бойко и часто.' },
  uklejka:    { name: 'Уклейка', min: 0.01, max: 0.12, trophy: 0.08, price: 50, pow: 1.0, stam: 0.6, mouth: 1, wary: 0.1, layer: 'surface', depth: [0.3, 6], tod: { dawn: 1, day: 1.4, dusk: 1, night: 0.1 }, baits: { maggot: 1, bread: 0.8, bloodworm: 0.6, dough: 0.6 }, lures: {}, style: 'steady', xp: 0.5, desc: 'Серебристая стайная рыбка верхних слоёв. Отличный живец для хищника.' },
  ersh:       { name: 'Ёрш', min: 0.01, max: 0.2, trophy: 0.12, price: 50, pow: 1.1, stam: 0.7, mouth: 2, wary: 0.05, layer: 'bottom', depth: [1, 8], tod: { dawn: 1, day: 0.7, dusk: 1, night: 1.2 }, baits: { worm: 1, bloodworm: 1, maggot: 0.7 }, lures: { twister: 0.3 }, style: 'steady', xp: 0.6, desc: 'Колючий и слизистый. Заглатывает насадку глубоко, зато уха из него — лучшая.' },
  nalim:      { name: 'Налим', min: 0.3, max: 8, trophy: 4, price: 200, pow: 1.2, stam: 1.0, mouth: 4, wary: 0.3, layer: 'bottom', depth: [2, 15], tod: { dawn: 0.5, day: 0.1, dusk: 0.8, night: 1.8 }, baits: { bigworm: 1, livebait: 1, worm: 0.6, shell: 0.4 }, lures: { vibro: 0.4 }, style: 'bottom', xp: 1.6, desc: 'Единственный пресноводный родич трески. Ночной охотник, днём почти не клюёт.' },
  gustera:    { name: 'Густера', min: 0.05, max: 1.2, trophy: 0.6, price: 90, pow: 1.2, stam: 0.9, mouth: 2, wary: 0.3, layer: 'bottom', depth: [1.5, 8], tod: { dawn: 1.1, day: 0.9, dusk: 1.2, night: 1 }, baits: { maggot: 1, bloodworm: 1, worm: 0.7, barley: 0.7, dough: 0.5 }, lures: {}, style: 'steady', xp: 0.9, desc: 'Похожа на молодого леща, но с розоватыми плавниками. Держится плотными стаями.' },
  sudak:      { name: 'Судак', min: 0.3, max: 14, trophy: 6, price: 280, pow: 1.4, stam: 1.0, mouth: 4, wary: 0.5, layer: 'bottom', depth: [3, 15], tod: { dawn: 1.2, day: 0.5, dusk: 1.4, night: 1.5 }, baits: { livebait: 1.1 }, lures: { twister: 1, vibro: 1.1, vibro_big: 0.8, crank: 0.5, spoon_silver: 0.5 }, style: 'bottom', xp: 1.7, desc: 'Клыкастый хищник глубоких бровок. Лучше всего ловится джигом у самого дна в сумерках.' },
  amur:       { name: 'Белый амур', min: 1, max: 25, trophy: 12, price: 200, pow: 2.0, stam: 1.5, mouth: 4, wary: 0.6, layer: 'mid', depth: [1, 5], tod: { dawn: 1, day: 1.3, dusk: 1, night: 0.5 }, baits: { corn: 1, pea: 1, boilie: 0.7, bread: 0.6, dough: 0.6, grasshopper: 0.4 }, lures: {}, style: 'runner', xp: 1.8, desc: 'Травоядный силач. Мощные рывки и долгие свечки — серьёзное испытание для снасти.' },
  vyun:       { name: 'Вьюн', min: 0.02, max: 0.3, trophy: 0.2, price: 70, pow: 1.2, stam: 0.8, mouth: 2, wary: 0.1, layer: 'bottom', depth: [0.3, 2], tod: { dawn: 1, day: 0.6, dusk: 1.2, night: 1.4 }, baits: { worm: 1, bloodworm: 1 }, lures: {}, style: 'zigzag', xp: 0.9, desc: 'Змеевидная рыбка болотного ила. Перед грозой становится беспокойной и пищит.' },
  forel:      { name: 'Форель ручьевая', min: 0.1, max: 4, trophy: 2, price: 420, pow: 2.1, stam: 1.3, mouth: 3, wary: 0.7, layer: 'mid', depth: [0.5, 3], tod: { dawn: 1.4, day: 0.9, dusk: 1.3, night: 0.3 }, baits: { worm: 0.7, caddis: 1, grasshopper: 0.9, maggot: 0.4 }, lures: { spinner_s: 1, spoon_silver: 1, wobbler: 0.9, fly: 1 }, style: 'jumper', xp: 1.8, desc: 'Пятнистая жительница холодных потоков. Выпрыгивает из воды и трясёт головой — держи леску натянутой!' },
  raduzhka:   { name: 'Радужная форель', min: 0.2, max: 6, trophy: 3, price: 380, pow: 2.2, stam: 1.3, mouth: 3, wary: 0.55, layer: 'mid', depth: [0.8, 3.5], tod: { dawn: 1.3, day: 1, dusk: 1.3, night: 0.3 }, baits: { worm: 0.8, caddis: 0.8, corn: 0.5, maggot: 0.5 }, lures: { spinner_s: 0.9, spoon: 0.8, wobbler: 0.8, fly: 0.7, spoon_silver: 0.9 }, style: 'jumper', xp: 1.7, desc: 'Розовая полоса вдоль бока переливается на солнце. Боец, каких мало.' },
  harius:     { name: 'Хариус', min: 0.1, max: 2.5, trophy: 1.4, price: 400, pow: 1.8, stam: 1.1, mouth: 2, wary: 0.6, layer: 'surface', depth: [0.4, 2.5], tod: { dawn: 1.2, day: 1.2, dusk: 1.3, night: 0.1 }, baits: { caddis: 1, grasshopper: 1, maggot: 0.6, bloodworm: 0.5 }, lures: { fly: 1.3, spinner_s: 0.8 }, style: 'jumper', xp: 1.8, desc: 'Хозяин горных перекатов с огромным флагом спинного плавника. Обожает мушку.' },
  lenok:      { name: 'Ленок', min: 0.3, max: 6, trophy: 3, price: 450, pow: 1.9, stam: 1.3, mouth: 3, wary: 0.55, layer: 'mid', depth: [1, 4], tod: { dawn: 1.3, day: 0.9, dusk: 1.3, night: 0.5 }, baits: { caddis: 0.8, worm: 0.7, grasshopper: 0.8, livebait: 0.4 }, lures: { spinner_l: 0.9, wobbler: 1, spoon: 0.8, fly: 0.5 }, style: 'runner', xp: 2.0, desc: 'Сибирский лосось с золотистым отливом. Стремительно уходит в струю.' },
  taimen:     { name: 'Таймень', min: 2, max: 50, trophy: 25, price: 600, pow: 2.0, stam: 1.6, mouth: 5, wary: 0.7, layer: 'mid', depth: [1.5, 6], tod: { dawn: 1.3, day: 0.6, dusk: 1.4, night: 0.9 }, baits: { livebait: 1, frog: 0.8 }, lures: { wobbler: 1.1, spinner_l: 0.7, vibro_big: 0.8, popper: 0.5, spoon: 0.6 }, style: 'jumper', xp: 3, desc: 'Царь горных рек с огненным хвостом. Встреча с ним — событие всей жизни.' },
  som:        { name: 'Сом', min: 2, max: 120, trophy: 50, price: 150, pow: 1.3, stam: 1.8, mouth: 5, wary: 0.4, layer: 'bottom', depth: [4, 20], tod: { dawn: 0.8, day: 0.3, dusk: 1.2, night: 1.8 }, baits: { frog: 1.2, crayfish: 1, shell: 1.1, livebait: 0.9, bigworm: 0.6 }, lures: { vibro_big: 1, crank: 0.3 }, style: 'bottom', xp: 2.5, desc: 'Усатый великан волжских ям. Ночью выходит на охоту. Нужна очень крепкая снасть.' },
  sazan:      { name: 'Сазан', min: 0.5, max: 18, trophy: 9, price: 210, pow: 2.0, stam: 1.5, mouth: 4, wary: 0.65, layer: 'bottom', depth: [2, 8], tod: { dawn: 1.4, day: 0.7, dusk: 1.3, night: 1 }, baits: { corn: 1, boilie: 1.1, pea: 0.8, dough: 0.7, worm: 0.4, shell: 0.4 }, lures: {}, style: 'runner', xp: 2.0, desc: 'Дикий предок карпа. Злее и выносливее домашнего родича.' },
  zherekh:    { name: 'Жерех', min: 0.4, max: 8, trophy: 4, price: 220, pow: 2.0, stam: 1.2, mouth: 4, wary: 0.7, layer: 'surface', depth: [1, 8], tod: { dawn: 1.2, day: 1.3, dusk: 1, night: 0.1 }, baits: { livebait: 0.6, grasshopper: 0.5 }, lures: { spoon_silver: 1.1, spinner_l: 1, popper: 0.9, spinner_s: 0.6, wobbler: 0.7 }, style: 'runner', xp: 1.8, desc: 'Бьёт малька у поверхности, поднимая фонтаны брызг. Ищи «котлы» и кидай блесну.' },
  sterlyad:   { name: 'Стерлядь', min: 0.3, max: 5, trophy: 2.5, price: 0, pow: 1.5, stam: 1.2, mouth: 2, wary: 0.5, layer: 'bottom', depth: [5, 18], tod: { dawn: 0.9, day: 0.6, dusk: 1.1, night: 1.4 }, baits: { bloodworm: 1, worm: 0.9, shell: 0.6, caddis: 0.5 }, lures: {}, style: 'bottom', xp: 2.5, protect: true, desc: 'Краснокнижная рыба из древнего рода осетровых. Только отпустить! Рыбнадзор благодарит премией.' },
  beluga:     { name: 'Белуга', min: 20, max: 300, trophy: 150, price: 0, pow: 1.2, stam: 2.0, mouth: 5, wary: 0.8, layer: 'bottom', depth: [10, 25], tod: { dawn: 0.8, day: 0.4, dusk: 1, night: 1.4 }, baits: { livebait: 1, shell: 0.5, crayfish: 0.5 }, lures: {}, style: 'bottom', xp: 40, protect: true, legend: true, desc: 'Исполинская осетровая, живая легенда Волги. Поймать и отпустить — мечта любого рыбака.' },
  palia:      { name: 'Голец (палия)', min: 0.3, max: 5, trophy: 2.5, price: 500, pow: 1.9, stam: 1.3, mouth: 3, wary: 0.6, layer: 'bottom', depth: [6, 20], tod: { dawn: 1.2, day: 0.8, dusk: 1.2, night: 0.9 }, baits: { worm: 0.8, livebait: 0.8, shell: 0.4 }, lures: { spoon_silver: 1, vibro: 0.7, spoon: 0.6 }, style: 'steady', xp: 2.2, desc: 'Северный голец с огненным брюхом. Живёт в ледяной глубине карельских озёр.' },
  sig:        { name: 'Сиг', min: 0.2, max: 4, trophy: 2, price: 380, pow: 1.6, stam: 1.1, mouth: 1, wary: 0.6, layer: 'mid', depth: [3, 15], tod: { dawn: 1.3, day: 0.9, dusk: 1.3, night: 0.6 }, baits: { bloodworm: 1, maggot: 1, caddis: 0.8, worm: 0.5 }, lures: { fly: 0.6 }, style: 'steady', xp: 1.6, desc: 'Серебристая сиговая рыба с маленьким ртом. Клюёт очень деликатно — нужен тонкий крючок.' },
  ryapushka:  { name: 'Ряпушка', min: 0.02, max: 0.25, trophy: 0.15, price: 120, pow: 1.2, stam: 0.7, mouth: 1, wary: 0.2, layer: 'mid', depth: [2, 12], tod: { dawn: 1, day: 1.2, dusk: 1, night: 0.5 }, baits: { maggot: 1, bloodworm: 1, bread: 0.4 }, lures: {}, style: 'steady', xp: 0.7, desc: 'Маленькая северная селёдочка. Стаи огромные — клюёт без остановки.' },
  losos:      { name: 'Озёрный лосось', min: 1, max: 14, trophy: 7, price: 700, pow: 2.3, stam: 1.6, mouth: 4, wary: 0.75, layer: 'mid', depth: [2, 12], tod: { dawn: 1.4, day: 0.7, dusk: 1.3, night: 0.5 }, baits: { livebait: 1, worm: 0.4 }, lures: { spoon_silver: 1.1, wobbler: 1, spinner_l: 0.8 }, style: 'jumper', xp: 3, desc: 'Серебряная торпеда северных озёр. Свечки, рывки и бешеный напор.' },
};

/* ---------- мусор и находки ---------- */
const JUNK = {
  junk_boot:   { name: 'Старый сапог', w: [0.6, 1.2], price: 3, xp: 2, desc: 'Кто-то явно ушёл домой босиком.' },
  junk_can:    { name: 'Ржавая банка', w: [0.1, 0.3], price: 1, xp: 1, desc: 'Сдадим в металлолом. Природе станет чище.' },
  junk_bottle: { name: 'Бутылка с запиской', w: [0.3, 0.5], price: 5, xp: 60, desc: 'Внутри старая записка с советом бывалого рыбака.' },
  junk_snag:   { name: 'Коряга', w: [1.5, 4], price: 0, xp: 2, desc: 'Тяжёлая и бесполезная. Зато водоём стал чище.' },
  junk_chest:  { name: 'Сундучок', w: [2, 3.5], price: 0, xp: 120, chest: true, desc: 'Окованный сундучок! Внутри звенят монеты.' },
};
const BOTTLE_TIPS = [
  'Лещ лучше всего клюёт на закате и ночью на глубине — прикорми точку фидером.',
  'Если леска тоньше, осторожная рыба клюёт чаще. Но крупную рыбу на ней тянуть рискованно.',
  'Падение давления перед дождём будит рыбу — клёв становится жарче.',
  'Птицы, ныряющие в воду, выдают стаю малька — рядом охотится хищник.',
  'Пузыри на воде — это кормящиеся карп, лещ или линь. Кидай туда!',
  'Не перетягивай фрикцион выше прочности лески — иначе обрыв неминуем.',
  'Наклоняй удилище против хода рыбы — она устанет быстрее.',
  'Сом выходит на охоту ночью. Лягушка и рак — его любимые лакомства.',
  'Золотая рыбка любит хлеб и тихий солнечный полдень.',
  'Крупный крючок отпугивает мелочь, а мелкий может не удержать трофей.',
];

/* ---------- водоёмы ---------- */
/* depth — профиль дна [дистанция м, глубина м]; current — течение (снос поплавка);
   snags — вероятность зацепов у дна; fish — базовая частота поклёвок вида (в минуту);
   sizeMul — множитель максимального веса вида на этом водоёме. */
const LOCATIONS = {
  pond: {
    rate: 1.0, name: 'Деревенский пруд', short: 'Пруд', level: 1, ticket: 0, hz: 0.50, music: 'pond', amb: 'birds',
    desc: 'Тихий пруд за околицей. Караси, плотва и окуни — идеальное место для первых поклёвок.',
    depth: [[2, 0.4], [6, 1.2], [12, 2.2], [20, 3.0], [30, 3.5], [45, 3.8], [100, 4]], current: 0, snags: 0.15, waves: 0.3,
    fish: { karas: 1.0, serkaras: 0.9, rotan: 0.8, plotva: 0.8, krasnoperka: 0.6, okun: 0.6, lin: 0.35, karp: 0.25, shchuka: 0.18, zolotaya: 0.006 },
    sizeMul: { karp: 0.45, shchuka: 0.45, lin: 0.9 }, junk: 0.10, color: '#5f8a52',
  },
  river: {
    rate: 1.15, name: 'Лесная река', short: 'Река', level: 3, ticket: 60, hz: 0.47, music: 'river', amb: 'river',
    desc: 'Быстрая речка в сосновом бору. Голавль, язь и щука ждут на ямах и перекатах. Течение сносит поплавок.',
    depth: [[2, 0.6], [8, 1.5], [15, 3.5], [25, 5.0], [35, 4.5], [50, 2.5], [70, 1.5], [120, 1.2]], current: 0.35, snags: 0.3, waves: 0.5,
    fish: { plotva: 0.9, uklejka: 0.8, peskar: 0.7, golavl: 0.45, yaz: 0.4, okun: 0.6, ersh: 0.5, leshch: 0.35, shchuka: 0.3, nalim: 0.28 },
    sizeMul: { shchuka: 0.6, leshch: 0.7 }, junk: 0.08, color: '#4d7357',
  },
  lake: {
    rate: 1.25, name: 'Озеро Светлое', short: 'Озеро', level: 5, ticket: 150, hz: 0.52, music: 'lake', amb: 'birds',
    desc: 'Большое чистое озеро с островами. На свалах глубин стоят лещ и судак, в заливах — карп и линь.',
    depth: [[2, 0.8], [10, 2], [25, 4], [35, 8], [60, 10], [100, 12], [160, 13]], current: 0, snags: 0.2, waves: 0.6,
    fish: { leshch: 0.7, gustera: 0.8, plotva: 0.8, okun: 0.6, shchuka: 0.45, sudak: 0.35, karp: 0.3, lin: 0.3, amur: 0.18 },
    sizeMul: { karp: 0.8, amur: 0.8 }, junk: 0.08, color: '#6f8fae',
  },
  swamp: {
    rate: 0.9, name: 'Туманное болото', short: 'Болото', level: 8, ticket: 250, hz: 0.54, music: 'swamp', amb: 'swamp',
    desc: 'Затянутая туманом топь среди мёртвых деревьев. Здесь водятся гигантские караси, лини и злые щуки.',
    depth: [[2, 0.3], [8, 1], [20, 1.8], [40, 2.5], [100, 2.7]], current: 0, snags: 0.55, waves: 0.15,
    fish: { karas: 1.0, serkaras: 0.8, rotan: 1.0, lin: 0.6, vyun: 0.6, shchuka: 0.45, okun: 0.4 },
    sizeMul: { karas: 1.0, serkaras: 1.0, lin: 1.0, shchuka: 1.0 }, sizeBoost: { karas: 1.6, serkaras: 1.4, lin: 1.3, shchuka: 1.2 }, junk: 0.16, color: '#56664f',
  },
  mountain: {
    rate: 1.15, name: 'Горная река', short: 'Горы', level: 11, ticket: 450, hz: 0.57, music: 'mountain', amb: 'rapids',
    desc: 'Ледяная река у подножия снежных пиков. Форель, хариус, ленок — и легендарный таймень.',
    depth: [[2, 0.4], [8, 1.2], [18, 2.8], [26, 3.5], [40, 1.8], [60, 1.2], [120, 1]], current: 0.7, snags: 0.45, waves: 0.9,
    fish: { forel: 0.8, raduzhka: 0.6, harius: 0.8, lenok: 0.4, golavl: 0.35, taimen: 0.08 },
    sizeMul: {}, junk: 0.05, color: '#7c8a9e',
  },
  volga: {
    rate: 1.7, name: 'Великая Волга', short: 'Волга', level: 14, ticket: 800, hz: 0.50, music: 'volga', amb: 'wind',
    desc: 'Широкая матушка-Волга. На ямах живут сомы-великаны, а в глубине бродит сама белуга.',
    depth: [[2, 1], [15, 3], [35, 7], [55, 12], [80, 16], [110, 18], [200, 20]], current: 0.25, snags: 0.3, waves: 0.7,
    fish: { leshch: 0.7, sazan: 0.4, zherekh: 0.4, sudak: 0.5, som: 0.2, sterlyad: 0.2, beluga: 0.008, shchuka: 0.3, gustera: 0.6, plotva: 0.6 },
    sizeMul: {}, junk: 0.09, color: '#c9a46f',
  },
  north: {
    rate: 1.9, name: 'Карельское озеро', short: 'Карелия', level: 18, ticket: 1300, hz: 0.53, music: 'north', amb: 'north',
    desc: 'Гранитные берега, сосны и северное сияние. Голец, сиг и серебряный озёрный лосось.',
    depth: [[2, 1.2], [10, 4], [25, 9], [50, 15], [90, 22], [200, 25]], current: 0, snags: 0.35, waves: 0.5,
    fish: { ryapushka: 0.9, sig: 0.6, palia: 0.35, losos: 0.14, shchuka: 0.45, okun: 0.6, nalim: 0.3, harius: 0.3 },
    sizeMul: {}, sizeBoost: { shchuka: 1.3, okun: 1.3 }, junk: 0.07, color: '#7d8790',
  },
};
const LOCATION_ORDER = ['pond', 'river', 'lake', 'swamp', 'mountain', 'volga', 'north'];
const MAP_POS = { pond: [0.20, 0.70], river: [0.36, 0.48], lake: [0.55, 0.62], swamp: [0.30, 0.22], mountain: [0.80, 0.24], volga: [0.70, 0.84], north: [0.58, 0.14] };

/* ---------- снасти ---------- */
const RIG_TYPES = {
  float:  { name: 'Поплавочная', short: 'Поплавок', desc: 'Классика: насадка на заданной глубине, поклёвку показывает поплавок.' },
  feeder: { name: 'Фидер', short: 'Фидер', desc: 'Донная снасть с кормушкой. Дальний заброс, прикормка собирает рыбу в точке.' },
  spin:   { name: 'Спиннинг', short: 'Спиннинг', desc: 'Активная ловля хищника на искусственные приманки — веди приманку подмоткой.' },
};

/* rods: cast — макс. дальность (м), power — нагрузка до перегруза (кг), sens — чувствительность */
const RODS = {
  rod_float_1:  { type: 'float', name: 'Удочка «Ветерок» 4 м', price: 0, level: 1, cast: 18, power: 4, sens: 0.5, tier: 1 },
  rod_float_2:  { type: 'float', name: 'Болонка «Река» 5 м', price: 900, level: 3, cast: 24, power: 6, sens: 0.65, tier: 2 },
  rod_float_3:  { type: 'float', name: 'Матчевая «Профи» 4,2 м', price: 4500, level: 8, cast: 34, power: 9, sens: 0.8, tier: 3 },
  rod_float_4:  { type: 'float', name: 'Карбон «Мастер» 6 м', price: 14000, level: 14, cast: 42, power: 14, sens: 0.95, tier: 4 },
  rod_feeder_1: { type: 'feeder', name: 'Пикер «Лайт» 2,7 м', price: 1500, level: 2, cast: 40, power: 6, sens: 0.6, tier: 1 },
  rod_feeder_2: { type: 'feeder', name: 'Фидер «Медиум» 3,3 м', price: 5200, level: 6, cast: 60, power: 11, sens: 0.7, tier: 2 },
  rod_feeder_3: { type: 'feeder', name: 'Фидер «Хэви» 3,9 м', price: 13500, level: 11, cast: 85, power: 20, sens: 0.8, tier: 3 },
  rod_feeder_4: { type: 'feeder', name: 'Карповик «Титан» 3,6 м', price: 32000, level: 17, cast: 110, power: 38, sens: 0.85, tier: 4 },
  rod_spin_1:   { type: 'spin', name: 'Спиннинг «Старт» 2,1 м', price: 1200, level: 2, cast: 30, power: 5, sens: 0.6, tier: 1 },
  rod_spin_2:   { type: 'spin', name: 'Твичинговый 2,4 м', price: 4800, level: 5, cast: 45, power: 10, sens: 0.75, tier: 2 },
  rod_spin_3:   { type: 'spin', name: 'Джиговик «Бровка» 2,7 м', price: 12500, level: 10, cast: 62, power: 18, sens: 0.85, tier: 3 },
  rod_spin_4:   { type: 'spin', name: '«Монстр» силовой 2,4 м', price: 38000, level: 18, cast: 72, power: 50, sens: 0.8, tier: 4 },
};

/* reels: drag — макс. фрикцион (кг), speed — скорость подмотки (м/с), cap — лескоёмкость (м) */
const REELS = {
  reel_1: { name: 'Катушка «Невская»', price: 0, level: 1, drag: 3, speed: 1.6, cap: 100, tier: 1 },
  reel_2: { name: 'Байтер 2000', price: 1600, level: 3, drag: 5, speed: 2.0, cap: 150, tier: 2 },
  reel_3: { name: 'Фидерная 4000', price: 6500, level: 7, drag: 9, speed: 2.4, cap: 200, tier: 3 },
  reel_4: { name: 'Силовая 6000', price: 16000, level: 12, drag: 18, speed: 2.8, cap: 260, tier: 4 },
  reel_5: { name: '«Золотая шпуля» 8000', price: 42000, level: 18, drag: 32, speed: 3.4, cap: 320, tier: 5 },
};

/* lines: str — разрывная нагрузка (кг), vis — заметность для рыбы, braid — плетёнка (не тянется) */
const LINES = {
  line_1: { name: 'Монолеска 0,16', price: 150, level: 1, str: 2.6, vis: 0.1, braid: false },
  line_2: { name: 'Монолеска 0,22', price: 0, level: 1, str: 4.5, vis: 0.25, braid: false },
  line_3: { name: 'Флюорокарбон 0,28', price: 2600, level: 6, str: 7, vis: 0.08, braid: false },
  line_4: { name: 'Плетёнка PE 1.0', price: 3800, level: 8, str: 10, vis: 0.35, braid: true },
  line_5: { name: 'Плетёнка PE 2.0', price: 9000, level: 12, str: 18, vis: 0.45, braid: true },
  line_6: { name: 'Шнур «Монстр» PE 5', price: 22000, level: 17, str: 36, vis: 0.6, braid: true },
};

/* hooks: size — размер (1 мелкий .. 5 крупный), pack — штук в упаковке */
const HOOKS = {
  hook_16: { name: 'Крючки №16', price: 60, level: 1, size: 1, pack: 10, hold: 0.85 },
  hook_12: { name: 'Крючки №12', price: 80, level: 1, size: 2, pack: 10, hold: 0.9 },
  hook_8:  { name: 'Крючки №8', price: 120, level: 3, size: 3, pack: 10, hold: 0.93 },
  hook_4:  { name: 'Крючки №4', price: 200, level: 7, size: 4, pack: 10, hold: 0.95 },
  hook_1:  { name: 'Крючки №1/0', price: 350, level: 12, size: 5, pack: 10, hold: 0.97 },
};

/* baits: size — крупность (влияет на размер рыбы), pack — штук */
const BAITS = {
  worm:        { name: 'Навозный червь', icon: 'bait_worm', price: 40, pack: 20, level: 1, size: 2, desc: 'Универсальная насадка — берёт почти всё.' },
  bigworm:     { name: 'Выползок', icon: 'bait_redworm', price: 90, pack: 15, level: 3, size: 3, desc: 'Крупный червь для налима, окуня и сома.' },
  maggot:      { name: 'Опарыш', icon: 'bait_maggot', price: 50, pack: 30, level: 1, size: 1, desc: 'Белая личинка — любимица плотвы и уклейки.' },
  bloodworm:   { name: 'Мотыль', icon: 'bait_bloodworm', price: 70, pack: 40, level: 2, size: 1, desc: 'Красная личинка комара. Деликатес для карася и леща.' },
  bread:       { name: 'Хлебный мякиш', icon: 'bait_bread', price: 20, pack: 20, level: 1, size: 1, desc: 'Простая растительная насадка для карася и краснопёрки.' },
  dough:       { name: 'Тесто с анисом', icon: 'bait_dough', price: 40, pack: 20, level: 1, size: 2, desc: 'Ароматное тесто — карась не устоит.' },
  corn:        { name: 'Кукуруза', icon: 'bait_corn', price: 60, pack: 25, level: 2, size: 2, desc: 'Сладкие зёрна для карпа, сазана и амура.' },
  barley:      { name: 'Перловка', icon: 'bait_barley', price: 40, pack: 30, level: 2, size: 1, desc: 'Распаренная перловка для плотвы и леща.' },
  pea:         { name: 'Горох', icon: 'bait_pea', price: 50, pack: 25, level: 3, size: 2, desc: 'Любимое лакомство язя и амура.' },
  boilie:      { name: 'Бойлы', icon: 'bait_boilie', price: 300, pack: 15, level: 6, size: 3, desc: 'Карповые шарики — отсекают мелочь, привлекают трофеи.' },
  grasshopper: { name: 'Кузнечик', icon: 'bait_grasshopper', price: 80, pack: 15, level: 4, size: 2, desc: 'Голавль, хариус и форель охотятся за насекомыми.' },
  caddis:      { name: 'Ручейник', icon: 'bait_caddis', price: 120, pack: 20, level: 9, size: 1, desc: 'Личинка в домике из песчинок. Лучшая насадка горных рек.' },
  livebait:    { name: 'Живец', icon: 'bait_livebait', price: 150, pack: 10, level: 5, size: 3, desc: 'Живая рыбка — приманка для щуки, судака и тайменя.' },
  crayfish:    { name: 'Рак', icon: 'bait_crayfish', price: 260, pack: 8, level: 12, size: 3, desc: 'Сом и голавль за рака готовы на всё.' },
  shell:       { name: 'Перловица', icon: 'bait_shell', price: 180, pack: 10, level: 10, size: 3, desc: 'Мясо речной ракушки. Для сома и крупного леща.' },
  frog:        { name: 'Лягушка', icon: 'bait_frog', price: 220, pack: 8, level: 14, size: 3, desc: 'Ночная насадка на сома и тайменя.' },
};

/* lures: layer — горизонт проводки, size — крупность */
const LURES = {
  spinner_s:    { name: 'Вертушка №1', icon: 'lure_spinner_s', price: 180, level: 1, layer: 'mid', size: 1, desc: 'Маленькая вращалка для окуня, форели и голавля.' },
  twister:      { name: 'Твистер на джиге', icon: 'lure_twister', price: 250, level: 2, layer: 'bottom', size: 1, desc: 'Мягкая приманка для донной проводки. Окунь и судак.' },
  spoon:        { name: 'Колебалка «Атом»', icon: 'lure_spoon', price: 300, level: 3, layer: 'mid', size: 2, desc: 'Легендарная щучья блесна.' },
  spinner_l:    { name: 'Вертушка №4', icon: 'lure_spinner_l', price: 350, level: 4, layer: 'mid', size: 2, desc: 'Крупная вертушка для щуки, жереха и тайменя.' },
  vibro:        { name: 'Виброхвост', icon: 'lure_vibro', price: 350, level: 5, layer: 'bottom', size: 2, desc: 'Джиговая приманка на судака и щуку.' },
  spoon_silver: { name: 'Блесна «Серебро»', icon: 'lure_spoon_silver', price: 450, level: 6, layer: 'mid', size: 2, desc: 'Сверкающая колебалка для лосося, жереха и форели.' },
  wobbler:      { name: 'Воблер-минноу', icon: 'lure_wobbler', price: 900, level: 7, layer: 'mid', size: 2, desc: 'Имитация малька: щука, голавль, ленок, таймень.' },
  popper:       { name: 'Поппер', icon: 'lure_popper', price: 800, level: 8, layer: 'surface', size: 2, desc: 'Чмокает по поверхности, провоцируя атаку.' },
  crank:        { name: 'Воблер-крэнк', icon: 'lure_crank', price: 1100, level: 9, layer: 'bottom', size: 2, desc: 'Глубоководный «пузатик» для окуня и судака.' },
  fly:          { name: 'Мушка с бомбардой', icon: 'lure_fly', price: 600, level: 9, layer: 'surface', size: 1, desc: 'Сухая мушка — хариус и форель в восторге.' },
  vibro_big:    { name: 'Виброхвост XL', icon: 'lure_vibro_big', price: 900, level: 13, layer: 'bottom', size: 3, desc: 'Огромная приманка на сома, тайменя и трофейную щуку.' },
};

/* groundbaits: fish — бонус к видам, power — сила привлечения */
const GROUNDBAITS = {
  gb_universal: { name: 'Прикормка «Универсал»', price: 150, pack: 10, level: 2, power: 0.45, fish: null, desc: 'Привлекает всю мирную рыбу.' },
  gb_roach:     { name: 'Прикормка «Плотва»', price: 180, pack: 10, level: 3, power: 0.85, fish: ['plotva', 'krasnoperka', 'uklejka', 'gustera', 'ryapushka', 'sig'], desc: 'Мелкий помол для плотвы, густеры и сига.' },
  gb_bream:     { name: 'Прикормка «Лещ»', price: 220, pack: 10, level: 5, power: 0.95, fish: ['leshch', 'gustera', 'yaz', 'sterlyad'], desc: 'Тяжёлая смесь для стай леща.' },
  gb_carp:      { name: 'Прикормка «Карп»', price: 300, pack: 10, level: 6, power: 0.95, fish: ['karp', 'sazan', 'karas', 'serkaras', 'lin', 'amur'], desc: 'Сладкая смесь с кукурузой.' },
  gb_river:     { name: 'Прикормка «Река»', price: 260, pack: 10, level: 8, power: 0.65, fish: null, river: true, desc: 'Липкая, не размывается течением.' },
  gb_night:     { name: 'Прикормка «Ночная»', price: 350, pack: 10, level: 12, power: 1.0, fish: ['leshch', 'nalim', 'som', 'sazan', 'karp', 'sterlyad'], night: true, desc: 'С аттрактантом — работает в темноте.' },
};

/* gear */
const GEAR = {
  keepnet_1: { name: 'Садок малый', price: 0, level: 1, cap: 15, slot: 'keepnet', desc: 'Вмещает до 15 кг улова.' },
  keepnet_2: { name: 'Садок большой', price: 2500, level: 5, cap: 50, slot: 'keepnet', desc: 'Вмещает до 50 кг улова.' },
  keepnet_3: { name: 'Садок «Трофей»', price: 12000, level: 12, cap: 250, slot: 'keepnet', desc: 'Вмещает до 250 кг — даже сома.' },
  net:       { name: 'Подсак', price: 900, level: 2, slot: 'net', desc: 'Без подсака рыба тяжелее 2 кг часто срывается у берега.' },
  sonar:     { name: 'Эхолот', price: 7000, level: 7, slot: 'sonar', desc: 'Показывает рельеф дна и рыбу. +10% к поклёвкам.' },
  charm:     { name: 'Талисман удачи', price: 15000, level: 10, slot: 'charm', desc: 'Шанс трофейной рыбы +40%.' },
  thermos:   { name: 'Термос с чаем', price: 300, level: 1, pack: 3, consumable: true, desc: '+30% к поклёвкам на 3 минуты. Согревает душу.' },
};

/* ---------- погода ---------- */
const WEATHER = {
  clear:  { name: 'Ясно', bite: 1.0 },
  cloudy: { name: 'Облачно', bite: 1.15 },
  rain:   { name: 'Дождь', bite: 1.25 },
  wind:   { name: 'Ветрено', bite: 0.85 },
  fog:    { name: 'Туман', bite: 1.1 },
};
const PRESSURE = {
  rising:  { name: 'растёт', bite: 0.85 },
  stable:  { name: 'стабильное', bite: 1.0 },
  falling: { name: 'падает', bite: 1.2 },
};

/* ---------- достижения ---------- */
const ACHIEVEMENTS = [
  { id: 'first',     name: 'Первая поклёвка', desc: 'Поймать первую рыбу', reward: 100, test: s => s.stats.caught >= 1 },
  { id: 'c10',       name: 'Удачный день', desc: 'Поймать 10 рыб', reward: 200, test: s => s.stats.caught >= 10 },
  { id: 'c100',      name: 'Бывалый', desc: 'Поймать 100 рыб', reward: 1000, test: s => s.stats.caught >= 100 },
  { id: 'c500',      name: 'Гроза водоёмов', desc: 'Поймать 500 рыб', reward: 5000, test: s => s.stats.caught >= 500 },
  { id: 'c1000',     name: 'Легенда рыбалки', desc: 'Поймать 1000 рыб', reward: 15000, test: s => s.stats.caught >= 1000 },
  { id: 'trophy1',   name: 'Трофей!', desc: 'Поймать трофейную рыбу', reward: 500, test: s => s.stats.trophies >= 1 },
  { id: 'trophy25',  name: 'Охотник за трофеями', desc: 'Поймать 25 трофеев', reward: 8000, test: s => s.stats.trophies >= 25 },
  { id: 'sp10',      name: 'Натуралист', desc: 'Поймать 10 разных видов', reward: 800, test: s => Object.keys(s.species).length >= 10 },
  { id: 'sp20',      name: 'Ихтиолог', desc: 'Поймать 20 разных видов', reward: 4000, test: s => Object.keys(s.species).length >= 20 },
  { id: 'spall',     name: 'Полный атлас', desc: 'Поймать все виды рыб', reward: 50000, test: s => Object.keys(s.species).length >= Object.keys(SPECIES).length },
  { id: 'gold',      name: 'Три желания', desc: 'Поймать золотую рыбку', reward: 3000, test: s => !!s.species.zolotaya },
  { id: 'beluga',    name: 'Царь-рыба', desc: 'Поймать белугу', reward: 20000, test: s => !!s.species.beluga },
  { id: 'som50',     name: 'Усатый великан', desc: 'Поймать сома тяжелее 50 кг', reward: 10000, test: s => s.species.som && s.species.som.best >= 50 },
  { id: 'taimen',    name: 'Огненный хвост', desc: 'Поймать тайменя', reward: 5000, test: s => !!s.species.taimen },
  { id: 'allloc',    name: 'Путешественник', desc: 'Порыбачить на всех водоёмах', reward: 6000, test: s => LOCATION_ORDER.every(k => s.visited[k]) },
  { id: 'lvl10',     name: 'Опытный рыболов', desc: 'Достичь 10 уровня', reward: 2000, test: s => s.level >= 10 },
  { id: 'lvl20',     name: 'Мастер спорта', desc: 'Достичь 20 уровня', reward: 10000, test: s => s.level >= 20 },
  { id: 'lvl30',     name: 'Гуру рыбалки', desc: 'Достичь 30 уровня', reward: 30000, test: s => s.level >= 30 },
  { id: 'rich',      name: 'Рыбный магнат', desc: 'Заработать 100 000 ₽', reward: 5000, test: s => s.stats.earned >= 100000 },
  { id: 'release50', name: 'Гуманист', desc: 'Отпустить 50 рыб', reward: 2500, test: s => s.stats.released >= 50 },
  { id: 'night50',   name: 'Ночной дозор', desc: 'Поймать 50 рыб ночью', reward: 2500, test: s => s.stats.night >= 50 },
  { id: 'float100',  name: 'Поплавочник', desc: '100 рыб на поплавок', reward: 3000, test: s => s.stats.tackle.float >= 100 },
  { id: 'feeder100', name: 'Фидерист', desc: '100 рыб на фидер', reward: 3000, test: s => s.stats.tackle.feeder >= 100 },
  { id: 'spin100',   name: 'Спиннингист', desc: '100 рыб на спиннинг', reward: 3000, test: s => s.stats.tackle.spin >= 100 },
  { id: 'chest',     name: 'Кладоискатель', desc: 'Выловить сундучок', reward: 1000, test: s => s.stats.chests >= 1 },
  { id: 'ton',       name: 'Тонна улова', desc: 'Поймать в сумме 1000 кг', reward: 20000, test: s => s.stats.weightG >= 1000000 },
];

/* ---------- уровни ---------- */
function xpForLevel(l) { return Math.round(80 * Math.pow(l, 1.45)); }

/* ---------- стартовое состояние ---------- */
function defaultSave() {
  return {
    v: 1, money: 400, xp: 0, level: 1,
    owned: { rod_float_1: 1, reel_1: 1, line_2: 1, keepnet_1: 1 },
    inv: { hook_12: 20, hook_16: 10, worm: 30, bread: 20, maggot: 10 },
    rigs: {
      float: { rod: 'rod_float_1', reel: 'reel_1', line: 'line_2', hook: 'hook_12', bait: 'worm', depth: 1.2 },
      feeder: { rod: null, reel: null, line: null, hook: 'hook_12', bait: 'maggot', gb: null },
      spin: { rod: null, reel: null, line: null, lure: null },
    },
    rig: 'float', broken: {},
    stats: { caught: 0, weightG: 0, released: 0, trophies: 0, junk: 0, chests: 0, night: 0, earned: 0, breaks: 0, tackle: { float: 0, feeder: 0, spin: 0 }, biggest: null },
    species: {}, visited: {}, ach: {}, quests: [], questDone: 0,
    clock: 6 * 60, day: 1, weather: 'clear', pressure: 'stable',
    daily: '', streak: 0, tut: {}, sound: true, music: true, amb: true, lastLoc: 'pond', thermos: 0,
  };
}
