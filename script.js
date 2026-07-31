/* ================================================================
   ANHS — ADVANCED NURTURING HIGH SCHOOL
   Dossier Élève — moteur de jeu (vanilla JS, aucune dépendance)
   ----------------------------------------------------------------
   Sommaire du fichier :
     1. Constantes & données statiques (stats, spécialités, avatars)
     2. Génération procédurale des PNJ (50+ élèves uniques)
     3. Modèle de sauvegarde (State) + SaveManager (localStorage)
     4. Utilitaires génériques (random, clamp, toast, modal...)
     5. Moteur de relations (joueur<->PNJ et PNJ<->PNJ)
     6. Système d'examens (bibliothèque + résolution)
     7. Système d'événements hebdomadaires / vie de classe
     8. IA des PNJ (simulation autonome)
     9. Boutique / Inventaire
    10. Contrôleur de jeu (Game) — boucle temporelle, avancement semaine
    11. UI — rendu des écrans (menu, création, dashboard, etc.)
    12. Initialisation & listeners
   ================================================================ */

'use strict';

/* ================================================================
   1. CONSTANTES & DONNÉES STATIQUES
   ================================================================ */

const STAT_KEYS = [
  'intelligence', 'charisme', 'force', 'endurance',
  'popularite', 'reputation', 'influence', 'chance', 'sangFroid'
];

const STAT_LABELS = {
  intelligence: 'Intelligence',
  charisme: 'Charisme',
  force: 'Force',
  endurance: 'Endurance',
  popularite: 'Popularité',
  reputation: 'Réputation',
  influence: 'Influence',
  chance: 'Chance',
  sangFroid: 'Sang-froid'
};

const STAT_DESC = {
  intelligence: "Résolution de problèmes, examens écrits, mémorisation.",
  charisme: "Capacité à convaincre, séduire, négocier.",
  force: "Performances physiques et intimidation.",
  endurance: "Résistance à la fatigue, aux épreuves de survie.",
  popularite: "Perception sociale globale au sein de l'école.",
  reputation: "Crédibilité de votre image auprès des enseignants et élèves.",
  influence: "Capacité à faire agir les autres en votre faveur.",
  chance: "Probabilité d'événements favorables et de coups de pouce du destin.",
  sangFroid: "Résistance à la pression, au bluff et à la manipulation adverse."
};

/* ---------------------------------------------------------------
   Profil stratégique (styles de jeu) — pour la rejouabilité.
   Chaque action marquante nourrit un ou plusieurs styles ; le style
   dominant influence les textes de fin et certaines réactions PNJ.
   --------------------------------------------------------------- */
const STYLE_KEYS = ['manipulateur', 'leader', 'strategue', 'combattant', 'discret'];
const STYLE_LABELS = {
  manipulateur: 'Manipulateur',
  leader: 'Leader populaire',
  strategue: 'Génie stratégique',
  combattant: 'Combattant',
  discret: 'Étudiant discret'
};
const STYLE_DESC = {
  manipulateur: "Vous avancez par le chantage, la corruption et la trahison calculée.",
  leader: "Vous fédérez, ralliez et incarnez une autorité naturelle reconnue de tous.",
  strategue: "Vous l'emportez par le calcul froid, l'anticipation et l'intelligence pure.",
  combattant: "Vous imposez le respect par la force, l'endurance et la confrontation directe.",
  discret: "Vous progressez dans l'ombre, sans jamais vous exposer inutilement."
};

function bumpStyle(state, key, amount){
  if (!STYLE_KEYS.includes(key)) return;
  if (!state.player.playstyle) { state.player.playstyle = {}; STYLE_KEYS.forEach(k => state.player.playstyle[k]=0); }
  state.player.playstyle[key] = (state.player.playstyle[key] || 0) + amount;
}

function getDominantStyle(state){
  const ps = state.player.playstyle || {};
  let bestKey = null, bestVal = -Infinity;
  STYLE_KEYS.forEach(k => { const v = ps[k] || 0; if (v > bestVal){ bestVal = v; bestKey = k; } });
  if (!bestKey || bestVal <= 0) return null;
  return { key: bestKey, label: STYLE_LABELS[bestKey], value: bestVal };
}

/** Consigne une interaction marquante dans la mémoire courte d'un PNJ (visible dans son dossier). */
function rememberNpc(state, npc, text){
  if (!npc) return;
  if (!npc.memory) npc.memory = [];
  npc.memory.unshift({ year: state.time.year, week: state.time.week, text });
  if (npc.memory.length > 6) npc.memory.length = 6;
}

const AVATARS = ['👤','🧑','👩','🧔','👨','🧑‍🦱','👩‍🦰','🧑‍🦳','👩‍🦱','🧑‍🎓','👩‍🎓','🧑‍💼'];

const SPECIALTIES = [
  {
    id: 'strategist',
    name: 'Stratège',
    tag: 'Prévoit tout, trois coups à l\'avance',
    desc: "Bonus en intelligence et sang-froid. Vous obtenez plus d'informations avant chaque examen et anticipez mieux les pièges.",
    bonus: { intelligence: 3, sangFroid: 2 }
  },
  {
    id: 'athlete',
    name: 'Sportif',
    tag: 'Le corps avant l\'esprit',
    desc: "Bonus en force et endurance. Excelle dans les épreuves physiques et les examens de survie.",
    bonus: { force: 3, endurance: 2 }
  },
  {
    id: 'intellectual',
    name: 'Intellectuel',
    tag: 'Premier de la classe, dans l\'ombre ou en pleine lumière',
    desc: "Bonus en intelligence et réputation. Domine les examens écrits et gagne la confiance des enseignants.",
    bonus: { intelligence: 3, reputation: 2 }
  },
  {
    id: 'manipulator',
    name: 'Manipulateur',
    tag: 'Tout le monde est une pièce sur l\'échiquier',
    desc: "Bonus en influence et charisme. Facilite la corruption, les alliances et la manipulation psychologique.",
    bonus: { influence: 3, charisme: 2 }
  },
  {
    id: 'socialite',
    name: 'Sociable',
    tag: 'Connu de tous, jugé par personne',
    desc: "Bonus en popularité et charisme. Construit un réseau social solide très rapidement.",
    bonus: { popularite: 3, charisme: 2 }
  },
  {
    id: 'ghost',
    name: 'Ombre',
    tag: 'On ne remarque que ce qu\'on choisit de montrer',
    desc: "Bonus en chance et sang-froid. Passe inaperçu, excelle dans l'espionnage et les coups fourrés.",
    bonus: { chance: 3, sangFroid: 2 }
  }
];

const CLASS_IDS = ['A', 'B', 'C', 'D'];
const CLASS_COLOR = { A: '#e8e3d3', B: '#d68a3c', C: '#b23a3a', D: '#5a6270' };
const CLASS_LABEL = {
  A: 'Classe d\'élite — privilèges maximaux',
  B: 'Classe solide — bonne réputation',
  C: 'Classe moyenne — sous pression constante',
  D: 'Classe des rebuts — méprisée par l\'administration'
};

const SEASONS = ['Printemps', 'Été', 'Automne', 'Hiver'];
const WEEKS_PER_YEAR = 28;
const MAX_YEARS = 3;

const WEEKDAYS = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];

const ACTIVITIES = {
  etudier:    { label: 'Étudier',            ic:'📖', stats:{intelligence:2},               desc:'Améliore l\'intelligence.' },
  entrainer:  { label: 'Entraînement physique', ic:'🏋️', stats:{force:2, endurance:1},       desc:'Améliore la force et l\'endurance.' },
  socialiser: { label: 'Socialiser',          ic:'💬', stats:{charisme:1, popularite:2},     desc:'Améliore le charisme et la popularité, renforce vos liens.' },
  espionner:  { label: 'Espionner',           ic:'🕵️', stats:{influence:1, chance:1},        desc:'Récolte des informations et des secrets sur d\'autres élèves.' },
  travailler: { label: 'Petit boulot',        ic:'💰', stats:{}, points: 120,                desc:'Rapporte des points personnels.' },
  reposer:    { label: 'Se reposer',          ic:'🛌', stats:{sangFroid:2, endurance:1},     desc:'Récupère le sang-froid, réduit le stress.' },
  club:       { label: 'Activité de club',    ic:'🎯', stats:{reputation:1, popularite:1},  desc:'Améliore votre image et votre réseau.' }
};

/* ---------------------------------------------------------------
   Pools pour la génération procédurale des PNJ
   --------------------------------------------------------------- */
const NAME_POOL = {
  F_FIRST: ['Aoi','Kei','Hana','Yui','Sae','Mio','Riko','Nana','Sora','Kaede','Airi','Chika','Hina','Yume','Rin','Miu','Nozomi','Kanon','Suzu','Ema','Karin','Momo','Reina','Yuzu','Kokona','Akane','Hikari','Yoshino','Mizuki','Sayaka','Tsumugi','Wakana','Anzu','Fuka','Ichika','Nagisa','Shiori','Tamaki','Yuna','Kotone'],
  M_FIRST: ['Kiyotaka','Suzune','Rokusuke','Kanji','Teruhiko','Yousuke','Haruki','Ren','Sota','Riku','Kaito','Daichi','Shun','Taiga','Kenta','Yuma','Hayato','Naoki','Ryo','Itsuki','Aoto','Gou','Jin','Retsu','Wataru','Ryota','Kenshin','Souma','Daiki','Yuuto','Kazuki','Masaru','Reiji','Tsubasa','Hikaru','Shingo','Touma','Akira','Kouhei','Ryosuke'],
  LAST: ['Ayanokōji','Horikita','Kushida','Hirata','Sudou','Ike','Yamauchi','Sakura','Karuizawa','Shinohara','Matsushita','Wang','Ishizaki','Ryuen','Ibuki','Katsuragi','Kamuro','Kitou','Sakayanagi','Hashimoto','Kirishima','Kanzaki','Shiranami','Kondou','Kobashi','Yagami','Kouenji','Nagumo','Amasawa','Tsukishiro','Mori','Toyama','Hazuki','Kimura','Yukimura','Kirihara','Yajima','Kudo','Ninomiya','Fukuyama','Onodera','Takashina','Nishino','Aiba','Tachibana','Fujimaki','Sengoku','Endou','Kirifuji','Manabe','Yamada','Satou','Takahashi','Watanabe','Itou','Nakamura','Kobayashi','Saitou','Matsumoto','Inoue','Kimoto','Fujiwara','Ogawa','Hasegawa','Ueda','Morita','Shimizu','Nishida','Okamoto','Ariga','Tsuchiya','Sano','Kaneko']
};

const ARCHETYPES = [
  { id:'genius_hidden', label:'Génie discret', traits:['calculateur','réservé','observateur'], statFocus:{intelligence:5,sangFroid:4,chance:3}, ambitionPool:['Percer sans jamais être vu venir','Tester ses propres limites en secret','Protéger quelqu\'un à qui il/elle tient'] },
  { id:'ambitious_leader', label:'Leader ambitieux', traits:['charismatique','autoritaire','fier'], statFocus:{charisme:5,influence:4,reputation:3}, ambitionPool:['Devenir président du conseil des élèves','Mener sa classe en Classe A','Ecraser tout rival potentiel'] },
  { id:'kind_hardworker', label:'Travailleur bienveillant', traits:['loyal','empathique','persévérant'], statFocus:{endurance:4,popularite:3,reputation:3}, ambitionPool:['Être digne de confiance pour tout le monde','Aider sa classe à progresser honnêtement','Ne trahir personne, quoi qu\'il en coûte'] },
  { id:'sly_manipulator', label:'Manipulateur retors', traits:['rusé','menteur','opportuniste'], statFocus:{influence:5,charisme:4,chance:3}, ambitionPool:['Tirer les ficelles sans jamais se salir les mains','Collectionner les secrets des autres','Grimper en marchant sur ses camarades'] },
  { id:'athletic_rival', label:'Rival sportif', traits:['compétitif','impulsif','fier'], statFocus:{force:5,endurance:4,popularite:2}, ambitionPool:['Être reconnu comme le meilleur physiquement','Défier quiconque le sous-estime','Prouver sa valeur à sa famille'] },
  { id:'anxious_follower', label:'Suiveur anxieux', traits:['timide','loyal','influençable'], statFocus:{sangFroid:2,popularite:2,chance:2}, ambitionPool:['Ne pas être laissé pour compte','Trouver un groupe où se sentir en sécurité','Éviter à tout prix d\'être exclu'] },
  { id:'cold_strategist', label:'Stratège froid', traits:['analytique','distant','impitoyable'], statFocus:{intelligence:5,sangFroid:5,influence:2}, ambitionPool:['Optimiser chaque situation à son avantage','Ne jamais montrer de faiblesse','Comprendre le système mieux que quiconque'] },
  { id:'charming_socialite', label:'Mondain charismatique', traits:['sociable','séducteur','superficiel en apparence'], statFocus:{charisme:5,popularite:5,chance:2}, ambitionPool:['Être aimé de tous, sans exception','Construire un réseau d\'alliés fidèles','Cacher sa véritable nature derrière un sourire'] },
  { id:'lone_wolf', label:'Solitaire singulier', traits:['excentrique','indépendant','imprévisible'], statFocus:{chance:5,intelligence:3,sangFroid:3}, ambitionPool:['Vivre selon ses propres règles','Ne dépendre de personne','Étudier les autres comme des curiosités'] },
  { id:'gossip', label:'Colporteur de rumeurs', traits:['curieux','bavard','opportuniste'], statFocus:{influence:3,popularite:3,chance:3}, ambitionPool:['Tout savoir sur tout le monde','Monnayer les secrets qu\'il/elle détient','Ne jamais être pris en défaut'] },
  { id:'loyal_protector', label:'Protecteur loyal', traits:['dévoué','protecteur','discret'], statFocus:{endurance:3,sangFroid:4,reputation:2}, ambitionPool:['Veiller sur les plus faibles de la classe','Ne jamais abandonner un allié, quoi qu\'il arrive','Se faire pardonner une ancienne erreur'] },
  { id:'chameleon', label:'Caméléon opportuniste', traits:['adaptable','calculateur','insaisissable'], statFocus:{chance:3,influence:3,charisme:3}, ambitionPool:['Toujours être du côté des vainqueurs','Ne jamais révéler ses véritables intentions','Se rendre indispensable à chaque camp'] },
  { id:'idealist_rebel', label:'Idéaliste rebelle', traits:['rebelle','franc','impulsif'], statFocus:{sangFroid:2,reputation:2,force:3}, ambitionPool:['Dénoncer les injustices du système de classes','Refuser de jouer selon les règles de l\'école','Prouver que la loyauté vaut plus que le classement'] },
  { id:'perfectionist', label:'Perfectionniste anxieux', traits:['méticuleux','stressé','brillant'], statFocus:{intelligence:4,sangFroid:2,reputation:2}, ambitionPool:['Ne jamais obtenir une note inférieure à la perfection','Cacher l\'ampleur de sa propre pression intérieure','Être reconnu(e) sans jamais avoir à le demander'] },
  { id:'silver_tongue', label:'Beau parleur retors', traits:['séducteur','rusé','superficiel en apparence'], statFocus:{charisme:4,influence:3,chance:2}, ambitionPool:['Se frayer un chemin par les mots plutôt que par le mérite','Collectionner les faveurs comme on collectionne les trophées','Ne jamais être tenu responsable de rien'] }
];

const SECRET_POOL = [
  'A triché lors d\'un examen d\'entrée.',
  'Vient d\'une famille extrêmement pauvre et le cache honteusement.',
  'A un frère ou une sœur déjà expulsé(e) de l\'école.',
  'Fait chanter un autre élève depuis des mois.',
  'A été impliqué(e) dans un incident violent au collège.',
  'Rapporte secrètement des informations à un enseignant.',
  'Est amoureux/amoureuse d\'un(e) élève d\'une autre classe.',
  'A menti sur son classement au concours d\'entrée.',
  'Souffre d\'une pression familiale extrême pour réussir.',
  'A déjà envisagé d\'abandonner l\'école.',
  'Cache un talent exceptionnel pour ne pas attirer l\'attention.',
  'A un accord secret avec un membre du personnel.',
  'A saboté un camarade lors d\'un examen passé.',
  'Fait partie d\'un groupe d\'entraide occulte entre classes.',
  'A menti sur son passé scolaire pour intégrer l\'école.',
  'Verse une partie de ses points personnels à sa famille en secret.',
  'A été surpris(e) en train de copier les notes d\'un enseignant.',
  'Entretient une correspondance interdite avec un(e) ancien(ne) élève renvoyé(e).',
  'Redoute d\'être découvert(e) comme informateur du conseil des élèves.',
  'A un accord tacite de non-agression avec un(e) rival(e) déclaré(e).',
  'Cache une blessure ou une faiblesse physique par fierté.',
  'A délibérément raté un examen pour rester proche de quelqu\'un.',
  'Est en réalité le/la cousin(e) d\'un membre de l\'administration.',
  'A menacé un(e) camarade pour garder le silence sur un incident.',
  'Falsifie régulièrement son emploi du temps pour disparaître discrètement.',
  'A gagné une somme d\'argent suspecte via des paris clandestins entre élèves.',
  'Se sent responsable de l\'exclusion d\'un ancien ami proche.'
];

const NPC_COUNT_PER_CLASS = { A: 12, B: 13, C: 13, D: 13 };


/* ================================================================
   4. UTILITAIRES GÉNÉRIQUES
   ================================================================ */

function rnd(min, max){ return Math.random() * (max - min) + min; }
function rndInt(min, max){ return Math.floor(rnd(min, max + 1)); }
function pick(arr){ return arr[rndInt(0, arr.length - 1)]; }
function pickN(arr, n){
  const copy = arr.slice();
  const out = [];
  while (out.length < n && copy.length){ out.push(copy.splice(rndInt(0, copy.length - 1), 1)[0]); }
  return out;
}
function clamp(v, min, max){ return Math.max(min, Math.min(max, v)); }
function uid(prefix){ return prefix + '_' + Math.random().toString(36).slice(2, 9); }
function weightedChoice(entries){
  const total = entries.reduce((s,e)=>s+e[1],0);
  let r = rnd(0, total);
  for (const [val, w] of entries){ if (r < w) return val; r -= w; }
  return entries[entries.length-1][0];
}

function toast(msg, kind){
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = 'toast' + (kind ? ' ' + kind : '');
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => el.remove(), 3600);
}

function escapeHtml(str){
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

/* ---------------------------------------------------------------
   RÉGLAGES PERSISTANTS (son, préférences UI)
   Stockés séparément de la sauvegarde de partie : ne touchent jamais
   au schéma de State, donc aucune sauvegarde existante n'est affectée.
   --------------------------------------------------------------- */
const SETTINGS_KEY = 'anhs_settings_v1';
const Settings = {
  data: { muted: false },
  load(){
    try{
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) Object.assign(this.data, JSON.parse(raw));
    } catch(e){ /* réglages ignorés si corrompus */ }
    return this.data;
  },
  save(){ try{ localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.data)); } catch(e){} },
  toggleMute(){ this.data.muted = !this.data.muted; this.save(); return this.data.muted; }
};

/* ---------------------------------------------------------------
   SFX — retours sonores d'interface synthétisés (Web Audio API).
   Aucun fichier externe requis : sert de placeholder immersif tant
   qu'aucun véritable design sonore n'est produit. L'API (SFX.play('x'))
   restera identique le jour où de vrais fichiers audio la remplaceront.
   --------------------------------------------------------------- */
const SFX = {
  ctx: null,
  ensureCtx(){
    if (!this.ctx){
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) { try{ this.ctx = new AC(); } catch(e){ this.ctx = null; } }
    }
    return this.ctx;
  },
  PRESETS: {
    click:       [{ freq:720, dur:.05, type:'sine',     gain:.045 }],
    nav:         [{ freq:480, dur:.06, type:'sine',     gain:.035 }],
    open:        [{ freq:340, dur:.08, type:'triangle', gain:.04  }],
    good:        [{ freq:520, dur:.09, type:'sine', gain:.055 }, { freq:780, dur:.11, type:'sine', gain:.05, delay:.07 }],
    bad:         [{ freq:230, dur:.17, type:'sawtooth', gain:.04 }],
    achievement: [{ freq:440, dur:.09, type:'sine', gain:.06 }, { freq:660, dur:.09, type:'sine', gain:.06, delay:.09 }, { freq:880, dur:.17, type:'sine', gain:.06, delay:.18 }]
  },
  play(type){
    if (Settings.data.muted) return;
    const ctx = this.ensureCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    (this.PRESETS[type] || this.PRESETS.click).forEach(note => {
      const t0 = ctx.currentTime + (note.delay || 0);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = note.type;
      osc.frequency.setValueAtTime(note.freq, t0);
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(note.gain, t0 + .012);
      gain.gain.exponentialRampToValueAtTime(.0001, t0 + note.dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0); osc.stop(t0 + note.dur + .02);
    });
  }
};

const TOAST_ICONS = { good:'✦', bad:'⚠', default:'ℹ' };
/** Notification flottante. sfxType permet de forcer un son distinct (ex. 'achievement') du son par défaut lié à kind. */
function toast(msg, kind, sfxType){
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = 'toast' + (kind ? ' ' + kind : '');
  el.innerHTML = `<span class="toast__ic">${TOAST_ICONS[kind] || TOAST_ICONS.default}</span><span class="toast__msg"></span>`;
  el.querySelector('.toast__msg').textContent = msg;
  el.title = 'Cliquer pour fermer';
  el.addEventListener('click', () => el.remove());
  root.appendChild(el);
  SFX.play(sfxType || (kind === 'good' ? 'good' : kind === 'bad' ? 'bad' : 'click'));
  setTimeout(() => el.remove(), 3600);
  const stack = root.querySelectorAll('.toast');
  if (stack.length > 4) stack[0].remove();
}

/** Modale de confirmation générique pour toute action sensible ou irréversible (remplace confirm() natif). */
function confirmAction({ eyebrow, title, text, confirmLabel, danger, onConfirm }){
  openModal({
    eyebrow: eyebrow || 'Confirmation requise',
    title: title || 'Êtes-vous sûr(e) ?',
    bodyHtml: `<p>${escapeHtml(text || '')}</p>`,
    choices: [{
      label: confirmLabel || 'Confirmer',
      sub: danger ? 'Action irréversible' : undefined,
      danger: !!danger,
      onClick(){ closeModal(); onConfirm(); }
    }],
    closeLabel: 'Annuler'
  });
}

/** Génère une ligne de statistique/jauge réutilisable (utilisée par toutes les vues avec des barres de progression). */
function statLineHtml(name, value, pct, desc){
  return `
    <div class="statline tt" data-tip="${escapeHtml(desc || '')}">
      <div class="statline__name">${escapeHtml(name)}</div>
      <div class="statline__track"><div class="statline__fill" style="width:${clamp(pct,0,100)}%"></div></div>
      <div class="statline__val">${value}</div>
    </div>`;
}

/* ================================================================
   2. GÉNÉRATION PROCÉDURALE DES PNJ
   ================================================================ */

function generateNpcPool(){
  const npcs = [];
  const usedNames = new Set();

  CLASS_IDS.forEach(classId => {
    const count = NPC_COUNT_PER_CLASS[classId];
    for (let i = 0; i < count; i++){
      let gender = pick(['F','M']);
      let first, last, full;
      let tries = 0;
      do {
        first = pick(gender === 'F' ? NAME_POOL.F_FIRST : NAME_POOL.M_FIRST);
        last = pick(NAME_POOL.LAST);
        full = last + ' ' + first;
        tries++;
      } while (usedNames.has(full) && tries < 40);
      usedNames.add(full);

      const arche = pick(ARCHETYPES);
      const stats = {};
      STAT_KEYS.forEach(k => { stats[k] = rndInt(15, 30); });
      Object.entries(arche.statFocus).forEach(([k, boost]) => {
        stats[k] = clamp(stats[k] + boost * rndInt(3, 6), 10, 95);
      });
      const classModifier = { A: 8, B: 3, C: 0, D: -4 }[classId];
      STAT_KEYS.forEach(k => { stats[k] = clamp(stats[k] + classModifier + rndInt(-4,4), 5, 98); });

      const secret = {
        text: pick(SECRET_POOL),
        severity: rndInt(1, 3),
        revealed: false
      };

      npcs.push({
        id: uid('npc'),
        firstName: first,
        lastName: last,
        fullName: full,
        gender,
        avatar: pick(AVATARS),
        classId,
        archetype: arche.id,
        archetypeLabel: arche.label,
        traits: arche.traits,
        stats,
        ambition: pick(arche.ambitionPool),
        secret,
        mood: rndInt(40, 75),
        opinionOfPlayer: rndInt(-5, 15),
        trustOfPlayer: rndInt(0, 20),
        fearOfPlayer: 0,
        relType: 'inconnu',
        bonds: {},
        allianceId: null,
        status: 'actif',
        history: [],
        memory: []
      });
    }
  });

  CLASS_IDS.forEach(classId => {
    const members = npcs.filter(n => n.classId === classId);
    members.forEach(n => {
      const others = pickN(members.filter(o => o.id !== n.id), rndInt(2,4));
      others.forEach(o => { n.bonds[o.id] = rndInt(10, 60); });
    });
  });

  return npcs;
}

/* ================================================================
   3. MODÈLE DE SAUVEGARDE + SAVEMANAGER
   ================================================================ */

const SAVE_KEY = 'anhs_savefile_v1';

const SaveManager = {
  save(state){
    try{
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
      return true;
    } catch(e){
      console.error('Erreur de sauvegarde', e);
      return false;
    }
  },
  load(){
    try{
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch(e){
      console.error('Sauvegarde corrompue', e);
      return null;
    }
  },
  exists(){ return !!localStorage.getItem(SAVE_KEY); },
  clear(){ localStorage.removeItem(SAVE_KEY); }
};

/**
 * Crée l'état initial d'une nouvelle partie.
 */
function createNewGameState(cfg){
  const npcs = generateNpcPool();

  const baseStats = {};
  STAT_KEYS.forEach(k => { baseStats[k] = 10; });

  const specialty = SPECIALTIES.find(s => s.id === cfg.specialtyId);
  Object.entries(specialty.bonus).forEach(([k, v]) => { baseStats[k] += v; });
  Object.entries(cfg.allocation).forEach(([k, v]) => { baseStats[k] += v; });

  const player = {
    name: cfg.name,
    gender: cfg.gender,
    avatar: cfg.avatar,
    specialtyId: cfg.specialtyId,
    stats: baseStats,
    points: 500,
    classId: 'D',
    inventory: [],
    relationships: {},          // npcId -> {affinity,trust,fear,type}
    knownSecrets: [],           // npcId list
    flags: {},
    journal: [],
    examHistory: [],
    unlockedAchievements: [],
    playstyle: { manipulateur:0, leader:0, strategue:0, combattant:0, discret:0 },
    lastJournalSeenCount: 0
  };

  const state = {
    version: 1,
    createdAt: Date.now(),
    player,
    npcs,
    time: { year: 1, week: 1, season: SEASONS[0] },
    classPoints: { A: 1000, B: 800, C: 600, D: 300 },
    planning: {},                // { 'Lundi': 'etudier', ... } — plan de la semaine courante
    upcomingExamId: null,        // id du prochain examen programmé
    scheduledExams: [],          // liste d'ids déjà générée pour l'année
    pendingEvent: null,
    gameOver: false,
    shopStock: SHOP_ITEMS.reduce((acc, it) => { if (it.stock != null) acc[it.id] = it.stock; return acc; }, {}),
    stats_meta: { examsCompleted: 0, alliancesFormed: 0, betrayals: 0, secretsDiscovered: 0 }
  };

  // planning par défaut
  WEEKDAYS.forEach(d => { state.planning[d] = (d === 'Samedi' || d === 'Dimanche') ? 'reposer' : 'etudier'; });

  // relations initiales : le joueur "connaît" tous les élèves de sa classe
  npcs.filter(n => n.classId === 'D').forEach(n => {
    player.relationships[n.id] = { affinity: rndInt(0,15), trust: rndInt(0,10), fear: 0, type: 'connaissance' };
  });

  addJournalEntry(state, `Dossier d'admission validé. Bienvenue à ANHS, ${player.name}. Vous intégrez la classe 1-D.`, 'system');

  return state;
}

function addJournalEntry(state, text, type){
  state.journal ? null : null;
  state.player.journal.unshift({
    year: state.time.year, week: state.time.week, text, type: type || 'info', ts: Date.now()
  });
  if (state.player.journal.length > 300) state.player.journal.length = 300;
}

/* ================================================================
   5. MOTEUR DE RELATIONS (joueur <-> PNJ)
   ================================================================ */

function getNpc(state, npcId){ return state.npcs.find(n => n.id === npcId); }

function getRel(state, npcId){
  if (!state.player.relationships[npcId]){
    state.player.relationships[npcId] = { affinity: 0, trust: 0, fear: 0, type: 'inconnu' };
  }
  return state.player.relationships[npcId];
}

function adjustRelation(state, npcId, delta){
  const rel = getRel(state, npcId);
  if (delta.affinity) rel.affinity = clamp(rel.affinity + delta.affinity, -100, 100);
  if (delta.trust)    rel.trust    = clamp(rel.trust + delta.trust, -100, 100);
  if (delta.fear)     rel.fear     = clamp(rel.fear + delta.fear, -100, 100);
  recomputeRelType(rel);
  return rel;
}

function recomputeRelType(rel){
  // Ne rétrograde pas automatiquement une romance ou une alliance déjà forgée manuellement,
  // sauf chute drastique de l'affinité.
  if (rel.type === 'romance' && rel.affinity < 20){ rel.type = 'rival'; return; }
  if (rel.type === 'allié' && rel.affinity < -10){ rel.type = 'ennemi'; return; }
  if (rel.type === 'romance' || rel.type === 'allié' || rel.type === 'ennemi') return;

  if (rel.affinity >= 70) rel.type = 'ami proche';
  else if (rel.affinity >= 35) rel.type = 'ami';
  else if (rel.affinity <= -50) rel.type = 'ennemi';
  else if (rel.affinity <= -20) rel.type = 'rival';
  else if (rel.affinity !== 0 || rel.trust !== 0) rel.type = 'connaissance';
  else rel.type = 'inconnu';
}

function relColor(type){
  switch(type){
    case 'ami proche': return '#3f8f6f';
    case 'ami': return '#4f9f7f';
    case 'allié': return '#c9a227';
    case 'romance': return '#c9527a';
    case 'connaissance': return '#5a6270';
    case 'rival': return '#d68a3c';
    case 'ennemi': return '#b23a3a';
    default: return '#3a4257';
  }
}

/** Propose une alliance formelle avec un PNJ (nécessite affinité/confiance suffisante). */
function formAlliance(state, npcId){
  const rel = getRel(state, npcId);
  const npc = getNpc(state, npcId);
  const chance = clamp(0.25 + rel.affinity/150 + rel.trust/200 + state.player.stats.charisme/300, 0.05, 0.92);
  const success = Math.random() < chance;
  if (success){
    rel.type = 'allié';
    rel.trust = clamp(rel.trust + 20, -100, 100);
    state.stats_meta.alliancesFormed++;
    addJournalEntry(state, `Alliance formée avec ${npc.fullName}.`, 'relation');
    rememberNpc(state, npc, `A scellé une alliance avec vous.`);
    bumpStyle(state, 'leader', 3);
  } else {
    rel.affinity = clamp(rel.affinity - 8, -100, 100);
    addJournalEntry(state, `${npc.fullName} a refusé votre proposition d'alliance.`, 'relation');
    rememberNpc(state, npc, `A refusé une alliance que vous proposiez.`);
  }
  return success;
}

/** Trahit un allié : gain immédiat, mais perte de confiance générale + rumeur possible. */
function betrayAlly(state, npcId, gainPoints){
  const rel = getRel(state, npcId);
  const npc = getNpc(state, npcId);
  rel.type = 'ennemi';
  rel.affinity = clamp(rel.affinity - 60, -100, 100);
  rel.trust = clamp(rel.trust - 50, -100, 100);
  state.player.points += gainPoints;
  state.stats_meta.betrayals++;
  state.player.stats.reputation = clamp(state.player.stats.reputation - rndInt(3,8), 0, 100);
  addJournalEntry(state, `Vous avez trahi ${npc.fullName} pour ${gainPoints} points. Cela ne restera pas secret longtemps.`, 'betrayal');
  rememberNpc(state, npc, `Vous a fait confiance et a été trahi(e) par vous.`);
  bumpStyle(state, 'manipulateur', 5);
  // risque de propagation de la rumeur
  if (Math.random() < 0.5){
    npc.classId === state.player.classId && (state.player.stats.popularite = clamp(state.player.stats.popularite - rndInt(2,6), 0, 100));
  }
}

/** Corrompt un élève avec des points pour obtenir un service (info, vote, sabotage...). */
function bribeNpc(state, npcId, amount){
  if (state.player.points < amount) return { success:false, reason:'points' };
  const npc = getNpc(state, npcId);
  const rel = getRel(state, npcId);
  const integrity = 100 - (npc.stats.sangFroid*0.3 + npc.stats.reputation*0.4); // + corruptible si sang-froid/réputation bas
  const willing = clamp(0.3 + amount/1200 + (rel.affinity/200) + (integrity/220), 0.05, 0.95);
  const success = Math.random() < willing;
  state.player.points -= amount;
  if (success){
    rel.trust = clamp(rel.trust - 5, -100, 100); // relation transactionnelle, pas de vraie confiance
    rel.fear = clamp(rel.fear + 4, -100, 100);
    addJournalEntry(state, `${npc.fullName} accepte votre offre de ${amount} points en échange d'un service.`, 'corruption');
    rememberNpc(state, npc, `A accepté ${amount} points de votre part contre un service.`);
    bumpStyle(state, 'manipulateur', 3);
  } else {
    addJournalEntry(state, `${npc.fullName} refuse votre corruption et s'en méfie désormais.`, 'corruption');
    rel.affinity = clamp(rel.affinity - 10, -100, 100);
    rememberNpc(state, npc, `A refusé une tentative de corruption de votre part.`);
  }
  return { success };
}

/** Tente d'obtenir/dévoiler le secret d'un PNJ (espionnage ciblé). */
function investigateSecret(state, npcId){
  const npc = getNpc(state, npcId);
  const chance = clamp(0.2 + state.player.stats.influence/220 + state.player.stats.chance/260 + (getRel(state,npcId).trust/300), 0.05, 0.9);
  const success = Math.random() < chance;
  if (success && !state.player.knownSecrets.includes(npcId)){
    state.player.knownSecrets.push(npcId);
    state.stats_meta.secretsDiscovered++;
    addJournalEntry(state, `Vous avez découvert un secret concernant ${npc.fullName}.`, 'secret');
    bumpStyle(state, 'discret', 3);
  } else if (!success){
    addJournalEntry(state, `Votre tentative pour percer les secrets de ${npc.fullName} a échoué.`, 'secret');
    npc.opinionOfPlayer = clamp(npc.opinionOfPlayer - 5, -100, 100);
    rememberNpc(state, npc, `A senti que vous fouilliez dans ses affaires.`);
  }
  return success;
}

/* ================================================================
   6. SYSTÈME D'EXAMENS
   ================================================================
   Chaque examen possède plusieurs stratégies. Chaque stratégie
   pondère différemment les statistiques du joueur pour déterminer
   un score, comparé à une difficulté, pour produire un palier
   d'issue (critique / réussite / partiel / échec).
   ================================================================ */

const EXAM_LIBRARY = [
  {
    id: 'exam_written_midterm',
    type: 'ecrit',
    name: 'Examen écrit de mi-trimestre',
    icon: '📝',
    desc: "Un examen académique classique noté individuellement, mais dont les mauvaises notes de classe font perdre des points communs.",
    difficulty: 55,
    strategies: [
      { id:'revise_seul', name:'Réviser seul, méthodiquement', sub:'Fiable, dépend entièrement de vous.', weights:{intelligence:0.9, sangFroid:0.2} },
      { id:'groupe_revision', name:'Former un groupe de révision', sub:'Répartit le risque, renforce vos liens sociaux.', weights:{intelligence:0.5, charisme:0.4, popularite:0.2}, relBoost:true },
      { id:'antisecheat', name:'Acheter des indices sur les questions', sub:'Coûteux et risqué si découvert.', weights:{influence:0.5, chance:0.4}, cost:150, riskCheat:true }
    ]
  },
  {
    id: 'exam_survival',
    type: 'survie',
    name: 'Camp de survie en forêt',
    icon: '🏕️',
    desc: "Une semaine en autonomie en pleine nature, en petits groupes. La faim, le froid et les tensions internes menacent la cohésion.",
    difficulty: 60,
    strategies: [
      { id:'leader', name:'Prendre la tête du groupe', sub:'Risqué : vous porterez la responsabilité des échecs.', weights:{endurance:0.5, influence:0.4, sangFroid:0.3} },
      { id:'support', name:'Soutenir en logistique discrète', sub:'Moins glorieux, mais plus sûr.', weights:{endurance:0.6, intelligence:0.3} },
      { id:'sabotage_rival', name:'Affaiblir discrètement un groupe rival', sub:'Immoral et risqué, mais potentiellement très payant.', weights:{influence:0.5, sangFroid:0.5}, sabotage:true }
    ]
  },
  {
    id: 'exam_vote',
    type: 'vote',
    name: 'Examen à vote inter-classes',
    icon: '🗳️',
    desc: "Chaque élève vote pour désigner un camarade jugé 'inutile'. Les plus votés perdent gros. La manipulation de l'opinion est reine.",
    difficulty: 50,
    strategies: [
      { id:'campagne', name:'Mener une campagne d\'image positive', sub:'Renforce durablement votre popularité.', weights:{charisme:0.6, popularite:0.4} },
      { id:'bouc_emissaire', name:'Orienter les votes vers un autre élève', sub:'Vous protège, mais crée un ennemi juré.', weights:{influence:0.7, sangFroid:0.3}, scapegoat:true },
      { id:'alliance_vote', name:'Négocier des votes croisés avec vos alliés', sub:'Nécessite déjà des alliances solides.', weights:{influence:0.5, charisme:0.3}, needsAlly:true }
    ]
  },
  {
    id: 'exam_espionnage',
    type: 'espionnage',
    name: 'Mission de renseignement inter-classes',
    icon: '🕶️',
    desc: "Votre classe doit obtenir des informations sur les stratégies d'une classe rivale sans se faire repérer.",
    difficulty: 58,
    strategies: [
      { id:'infiltration', name:'Infiltrer discrètement', sub:'Haute récompense, haut risque de démasquage.', weights:{chance:0.5, sangFroid:0.4} },
      { id:'achat_info', name:'Acheter l\'information à un contact', sub:'Coûteux mais fiable.', weights:{influence:0.6}, cost:200 },
      { id:'reseau', name:'Utiliser votre réseau social', sub:'Repose sur vos relations construites au fil du temps.', weights:{charisme:0.5, popularite:0.4}, relBoost:true }
    ]
  },
  {
    id: 'exam_negociation',
    type: 'negociation',
    name: 'Négociation de points inter-classes',
    icon: '🤝',
    desc: "Les classes peuvent échanger des points de classe contre des ressources ou des faveurs. Un jeu d'équilibriste entre gain immédiat et confiance.",
    difficulty: 52,
    strategies: [
      { id:'juste', name:'Négocier équitablement', sub:'Construit une réputation de partenaire fiable.', weights:{charisme:0.5, reputation:0.4} },
      { id:'dur', name:'Négocier de manière agressive', sub:'Maximise le gain immédiat, au prix de la confiance.', weights:{influence:0.6, sangFroid:0.3} },
      { id:'piege', name:'Tendre un piège contractuel', sub:'Risque élevé de représailles si découvert.', weights:{intelligence:0.5, influence:0.4}, sabotage:true }
    ]
  },
  {
    id: 'exam_psychologique',
    type: 'psychologique',
    name: 'Jeu psychologique — Le Dilemme',
    icon: '🧠',
    desc: "Un jeu de type dilemme du prisonnier généralisé à toute la classe : coopérer rapporte peu mais sûrement, trahir peut rapporter gros ou tout faire perdre.",
    difficulty: 50,
    strategies: [
      { id:'cooperer', name:'Coopérer avec toute la classe', sub:'Gain modeste, cohésion renforcée.', weights:{sangFroid:0.4, reputation:0.4} },
      { id:'trahir_calcule', name:'Trahir au moment optimal', sub:'Gain potentiellement énorme, confiance brisée.', weights:{intelligence:0.5, sangFroid:0.5}, sabotage:true },
      { id:'bluff', name:'Bluffer pour pousser les autres à coopérer', sub:'Demande un sang-froid à toute épreuve.', weights:{sangFroid:0.6, charisme:0.3} }
    ]
  },
  {
    id: 'exam_enigme',
    type: 'enigme',
    name: 'Salle des énigmes',
    icon: '🧩',
    desc: "Une série d'énigmes logiques à résoudre en temps limité, en équipe restreinte.",
    difficulty: 54,
    strategies: [
      { id:'logique', name:'Résoudre par la logique pure', sub:'Repose entièrement sur votre intelligence.', weights:{intelligence:1.0} },
      { id:'equipe', name:'Diviser les énigmes en équipe', sub:'Plus rapide, dépend de la qualité de vos coéquipiers.', weights:{intelligence:0.5, charisme:0.4}, relBoost:true },
      { id:'intuition', name:'Foncer à l\'intuition', sub:'Rapide mais aléatoire.', weights:{chance:0.8} }
    ]
  },
  {
    id: 'exam_sportif',
    type: 'sportif',
    name: 'Festival sportif inter-classes',
    icon: '🏃',
    desc: "Une compétition physique par équipes dont les résultats affectent directement les points de classe.",
    difficulty: 56,
    strategies: [
      { id:'perf_max', name:'Viser la performance individuelle maximale', sub:'Tout repose sur votre forme physique.', weights:{force:0.6, endurance:0.4} },
      { id:'coach', name:'Coacher et motiver l\'équipe', sub:'Un bon meneur peut compenser un niveau moyen.', weights:{charisme:0.5, influence:0.3, endurance:0.2} },
      { id:'strategie_sport', name:'Élaborer une stratégie d\'équipe', sub:'Optimise les forces de chacun.', weights:{intelligence:0.5, sangFroid:0.3, endurance:0.2} }
    ]
  }
];

let currentExamContext = null; // stocke l'examen en cours de résolution (modale)

/** Calcule le score final d'une stratégie et détermine le palier de réussite. */
function resolveExamStrategy(state, exam, strategy){
  let score = 0;
  Object.entries(strategy.weights).forEach(([stat, w]) => {
    score += state.player.stats[stat] * w;
  });
  // bonus de spécialité
  const specialty = SPECIALTIES.find(s => s.id === state.player.specialtyId);
  if (specialty && specialty.bonus[Object.keys(strategy.weights)[0]]) score += 6;

  // bonus relationnel (utile si la stratégie s'appuie sur le groupe)
  if (strategy.relBoost){
    const classmates = Object.values(state.player.relationships);
    const avgAff = classmates.length ? classmates.reduce((s,r)=>s+r.affinity,0)/classmates.length : 0;
    score += avgAff * 0.25;
  }

  // chance influe toujours un peu + aléa
  score += state.player.stats.chance * 0.15;
  score += rndInt(-16, 16);

  const diff = exam.difficulty;
  let tier;
  if (score >= diff + 22) tier = 'critique';
  else if (score >= diff + 4) tier = 'reussite';
  else if (score >= diff - 16) tier = 'partiel';
  else tier = 'echec';

  return { score: Math.round(score), tier };
}

/** Applique les conséquences d'un examen selon le palier obtenu. */
function applyExamOutcome(state, exam, strategy, result){
  const tierData = {
    critique: { pointsMult: 2.2, statGain: 3, repDelta: 6, label: 'Réussite critique' },
    reussite: { pointsMult: 1.2, statGain: 2, repDelta: 3, label: 'Réussite' },
    partiel:  { pointsMult: 0.4, statGain: 1, repDelta: 0, label: 'Résultat mitigé' },
    echec:    { pointsMult: -0.8, statGain: 0, repDelta: -5, label: 'Échec' }
  }[result.tier];

  const basePoints = 260;
  const pointsDelta = Math.round(basePoints * tierData.pointsMult);
  state.player.points = Math.max(0, state.player.points + pointsDelta);
  state.classPoints[state.player.classId] = Math.max(0, state.classPoints[state.player.classId] + Math.round(pointsDelta * 1.4));

  // gains de stats liés aux poids de la stratégie utilisée
  Object.keys(strategy.weights).forEach(stat => {
    state.player.stats[stat] = clamp(state.player.stats[stat] + tierData.statGain, 0, 100);
  });
  state.player.stats.reputation = clamp(state.player.stats.reputation + tierData.repDelta, 0, 100);

  // coûts éventuels
  if (strategy.cost) state.player.points = Math.max(0, state.player.points - strategy.cost);

  // effets spéciaux
  let extraText = '';
  const hasAlibi = (state.player.flags.alibiWeeksLeft || 0) > 0;
  if (strategy.riskCheat && Math.random() < (hasAlibi ? 0.08 : 0.3)){
    state.player.stats.reputation = clamp(state.player.stats.reputation - 15, 0, 100);
    state.player.points = Math.max(0, state.player.points - 100);
    extraText = " Votre tricherie a été repérée : votre réputation en pâtit lourdement.";
  }
  if (strategy.sabotage){
    const targetPool = state.npcs.filter(n => n.classId !== state.player.classId && n.status === 'actif');
    if (targetPool.length){
      const target = pick(targetPool);
      getRel(state, target.id).affinity = clamp(getRel(state, target.id).affinity - 30, -100, 100);
      target.opinionOfPlayer = clamp(target.opinionOfPlayer - 25, -100, 100);
      extraText += ` ${target.fullName} soupçonne votre implication et s'en méfiera désormais.`;
    }
  }
  if (strategy.scapegoat){
    const targetPool = state.npcs.filter(n => n.classId === state.player.classId && n.status === 'actif');
    if (targetPool.length){
      const target = pick(targetPool);
      target.opinionOfPlayer = clamp(target.opinionOfPlayer - 40, -100, 100);
      getRel(state, target.id).type = 'ennemi';
      getRel(state, target.id).affinity = clamp(getRel(state, target.id).affinity - 45, -100, 100);
      extraText += ` ${target.fullName} a payé le prix à votre place et ne vous le pardonnera pas.`;
    }
  }
  if (strategy.relBoost && result.tier !== 'echec'){
    Object.keys(state.player.relationships).forEach(npcId => {
      adjustRelation(state, npcId, { affinity: 3, trust: 2 });
    });
  }

  // influence sur le profil stratégique selon la nature de la stratégie choisie
  if (strategy.sabotage || strategy.scapegoat || strategy.riskCheat) bumpStyle(state, 'manipulateur', 3);
  if (strategy.needsAlly || strategy.id === 'leader' || strategy.id === 'campagne' || strategy.id === 'coach') bumpStyle(state, 'leader', 3);
  if (strategy.weights.force || strategy.weights.endurance) bumpStyle(state, 'combattant', Math.round(((strategy.weights.force||0)+(strategy.weights.endurance||0))*4));
  if (strategy.weights.intelligence || strategy.weights.sangFroid) bumpStyle(state, 'strategue', Math.round(((strategy.weights.intelligence||0)+(strategy.weights.sangFroid||0))*3));
  if (strategy.id === 'support' || strategy.id === 'infiltration' || strategy.id === 'antisecheat') bumpStyle(state, 'discret', 3);

  state.stats_meta.examsCompleted++;
  const txt = `${exam.name} — ${tierData.label} (stratégie : ${strategy.name}). Points personnels : ${pointsDelta >= 0 ? '+' : ''}${pointsDelta}.${extraText}`;
  addJournalEntry(state, txt, 'exam');
  state.player.examHistory.push({ examId: exam.id, tier: result.tier, week: state.time.week, year: state.time.year });

  return { tierData, pointsDelta, extraText };
}

/* ================================================================
   7. ÉVÉNEMENTS HEBDOMADAIRES
   ================================================================ */

const WEEKLY_EVENTS = [
  {
    id: 'ev_help_request',
    title: 'Demande d\'aide',
    text(state, npc){ return `${npc.fullName} vous demande discrètement de l'aider à réviser avant le prochain examen.`; },
    weight: 10,
    choices: [
      { label:'Accepter et l\'aider sincèrement', sub:'+relation, +réputation, -temps', apply(state, npc){
          adjustRelation(state, npc.id, { affinity: 12, trust: 10 });
          state.player.stats.reputation = clamp(state.player.stats.reputation + 2, 0, 100);
          return `Vous avez aidé ${npc.fullName}. Votre relation se renforce.`;
        }},
      { label:'Accepter mais en échange d\'une faveur future', sub:'+relation modérée, +influence', apply(state, npc){
          adjustRelation(state, npc.id, { affinity: 5, trust: -3, fear: 2 });
          state.player.stats.influence = clamp(state.player.stats.influence + 2, 0, 100);
          return `${npc.fullName} accepte votre marché. Vous avez désormais une faveur à réclamer.`;
        }},
      { label:'Refuser', sub:'Aucun effet, relation stagnante', apply(state, npc){
          adjustRelation(state, npc.id, { affinity: -4 });
          return `Vous avez décliné poliment. ${npc.fullName} semble déçu(e).`;
        }}
    ]
  },
  {
    id: 'ev_gossip_offer',
    title: 'Rumeur en circulation',
    text(state, npc){ return `${npc.fullName} vous propose d'échanger des informations compromettantes sur un autre élève.`; },
    weight: 8,
    choices: [
      { label:'Accepter l\'échange', sub:'+secret, relation transactionnelle', apply(state, npc){
          const pool = state.npcs.filter(n => n.id !== npc.id && n.status==='actif' && !state.player.knownSecrets.includes(n.id));
          if (pool.length){
            const target = pick(pool);
            state.player.knownSecrets.push(target.id);
            state.stats_meta.secretsDiscovered++;
            adjustRelation(state, npc.id, { trust: -2 });
            return `${npc.fullName} vous révèle un secret sur ${target.fullName}.`;
          }
          return `${npc.fullName} n'avait finalement rien de nouveau à offrir.`;
        }},
      { label:'Refuser par principe', sub:'+réputation légère', apply(state, npc){
          state.player.stats.reputation = clamp(state.player.stats.reputation + 1, 0, 100);
          return `Vous refusez de jouer ce jeu-là. ${npc.fullName} hausse les épaules.`;
        }}
    ]
  },
  {
    id: 'ev_alliance_offer',
    title: 'Proposition d\'alliance',
    text(state, npc){ return `${npc.fullName} vous propose une alliance informelle pour les prochains examens.`; },
    weight: 7,
    choices: [
      { label:'Accepter l\'alliance', sub:'Alliance formelle si les conditions sont réunies', apply(state, npc){
          const success = formAlliance(state, npc.id);
          return success ? `Alliance scellée avec ${npc.fullName}.` : `${npc.fullName} a finalement hésité et l'accord capote.`;
        }},
      { label:'Décliner prudemment', sub:'Neutre', apply(state, npc){
          return `Vous préférez ne pas vous engager avec ${npc.fullName} pour l'instant.`;
        }}
    ]
  },
  {
    id: 'ev_bribe_opportunity',
    title: 'Occasion de corruption',
    text(state, npc){ return `Vous apprenez que ${npc.fullName} accepterait volontiers des points en échange d'un service discret.`; },
    weight: 6,
    choices: [
      { label:'Corrompre (200 points)', sub:'Coût élevé, résultat incertain', apply(state, npc){
          const res = bribeNpc(state, npc.id, 200);
          return res.success ? `${npc.fullName} est maintenant redevable.` : `La tentative échoue et entache votre relation.`;
        }},
      { label:'Ignorer', sub:'Aucun effet', apply(){ return `Vous laissez filer cette occasion.`; } }
    ]
  },
  {
    id: 'ev_rival_provocation',
    title: 'Provocation',
    text(state, npc){ return `${npc.fullName} vous provoque ouvertement devant plusieurs élèves, cherchant à ébranler votre sang-froid.`; },
    weight: 6,
    choices: [
      { label:'Rester impassible', sub:'+sang-froid, +réputation', apply(state, npc){
          state.player.stats.sangFroid = clamp(state.player.stats.sangFroid + 3, 0, 100);
          state.player.stats.reputation = clamp(state.player.stats.reputation + 1, 0, 100);
          adjustRelation(state, npc.id, { affinity: -5 });
          bumpStyle(state, 'discret', 2);
          rememberNpc(state, npc, `Vous a provoqué(e) sans parvenir à vous déstabiliser.`);
          return `Vous ne cillez pas. ${npc.fullName} perd de sa superbe face à votre calme.`;
        }},
      { label:'Répliquer fermement', sub:'+charisme, relation dégradée', apply(state, npc){
          state.player.stats.charisme = clamp(state.player.stats.charisme + 2, 0, 100);
          adjustRelation(state, npc.id, { affinity: -18, trust: -10 });
          bumpStyle(state, 'combattant', 3);
          rememberNpc(state, npc, `Vous a affronté(e) ouvertement devant la classe.`);
          return `L'échange tourne à la confrontation ouverte avec ${npc.fullName}.`;
        }},
      { label:'Désamorcer avec humour', sub:'+popularité', apply(state, npc){
          state.player.stats.popularite = clamp(state.player.stats.popularite + 3, 0, 100);
          adjustRelation(state, npc.id, { affinity: 4 });
          bumpStyle(state, 'leader', 2);
          return `Votre repartie fait rire la classe. La tension retombe.`;
        }}
    ]
  },
  {
    id: 'ev_secret_leverage',
    title: 'Un secret à exploiter',
    text(state, npc){ return `Vous détenez une information compromettante sur ${npc.fullName}. Que faites-vous ?`; },
    weight: 5,
    requires(state){ return state.player.knownSecrets.length > 0; },
    pickNpc(state){ const ids = state.player.knownSecrets; return getNpc(state, pick(ids)); },
    choices: [
      { label:'Faire chanter discrètement', sub:'+points, forte perte de confiance, +peur', apply(state, npc){
          state.player.points += 220;
          adjustRelation(state, npc.id, { affinity: -25, trust: -30, fear: 25 });
          npc.mood = clamp(npc.mood - 15, 0, 100);
          bumpStyle(state, 'manipulateur', 4);
          rememberNpc(state, npc, `Vous a cédé 220 points sous la menace d'un chantage.`);
          return `${npc.fullName} cède à contrecœur et vous verse 220 points.`;
        }},
      { label:'Garder le silence, s\'en servir plus tard', sub:'Aucun effet immédiat', apply(state, npc){
          bumpStyle(state, 'discret', 1);
          return `Vous gardez cette carte en réserve pour le moment opportun.`;
        }},
      { label:'Le révéler publiquement', sub:'Détruit sa réputation, se fait un ennemi juré', apply(state, npc){
          npc.stats.reputation = clamp(npc.stats.reputation - 30, 0, 100);
          npc.mood = clamp(npc.mood - 30, 0, 100);
          const backlash = state.player.flags.scandalInsurance ? 20 : 60;
          adjustRelation(state, npc.id, { affinity: -backlash, trust: -backlash, fear: 10 });
          getRel(state, npc.id).type = 'ennemi';
          bumpStyle(state, 'manipulateur', 4);
          rememberNpc(state, npc, `A vu son secret étalé publiquement par vos soins.`);
          if (state.player.flags.scandalInsurance){
            state.player.flags.scandalInsurance = false;
            return `Le secret de ${npc.fullName} éclate au grand jour, mais votre entourage soigneusement préparé limite les retombées sur vous.`;
          }
          return `Le secret de ${npc.fullName} éclate au grand jour. La classe entière en parle.`;
        }}
    ]
  },
  {
    id: 'ev_romance_moment',
    title: 'Moment privilégié',
    text(state, npc){ return `Vous vous retrouvez seul(e) avec ${npc.fullName} après les cours. L'ambiance est particulière.`; },
    weight: 4,
    requires(state, npc){ const rel = getRel(state, npc.id); return rel.affinity >= 40; },
    choices: [
      { label:'Tenter un rapprochement', sub:'Peut mener à une romance', apply(state, npc){
          const rel = getRel(state, npc.id);
          const chance = clamp(0.3 + rel.affinity/180 + state.player.stats.charisme/220, 0.1, 0.85);
          if (Math.random() < chance){
            rel.type = 'romance';
            rel.affinity = clamp(rel.affinity + 15, -100, 100);
            return `Un lien nouveau se crée entre vous et ${npc.fullName}.`;
          }
          rel.affinity = clamp(rel.affinity - 6, -100, 100);
          return `Le moment retombe maladroitement. ${npc.fullName} semble gêné(e).`;
        }},
      { label:'Rester sur le plan amical', sub:'Neutre, sûr', apply(state, npc){
          return `Vous préférez ne rien précipiter avec ${npc.fullName}.`;
        }}
    ]
  },
  {
    id: 'ev_rumor_about_you',
    title: 'Une rumeur circule sur vous',
    text(state, npc){ return `${npc.fullName} vous rapporte qu'une rumeur — plus ou moins flatteuse — circule à votre sujet dans les couloirs.`; },
    weight: 7,
    choices: [
      { label:'Démentir publiquement', sub:'+réputation si réussi, coûte du temps', apply(state, npc){
          const chance = clamp(0.35 + state.player.stats.charisme/200, 0.2, 0.8);
          if (Math.random() < chance){
            state.player.stats.reputation = clamp(state.player.stats.reputation + 3, 0, 100);
            return `Votre mise au point convainc la majorité. La rumeur retombe.`;
          }
          state.player.stats.reputation = clamp(state.player.stats.reputation - 2, 0, 100);
          return `Votre démenti sonne creux. La rumeur persiste, amplifiée.`;
        }},
      { label:'Laisser courir sans réagir', sub:'Neutre, imprévisible sur la durée', apply(state, npc){
          return `Vous décidez d'ignorer la rumeur. ${npc.fullName} hausse les épaules.`;
        }},
      { label:'Retourner la rumeur à votre avantage', sub:'+influence, risqué', apply(state, npc){
          state.player.stats.influence = clamp(state.player.stats.influence + 3, 0, 100);
          adjustRelation(state, npc.id, { trust: -3 });
          return `Vous entretenez habilement l'ambiguïté. Cela vous rend plus... intéressant(e).`;
        }}
    ]
  },
  {
    id: 'ev_class_debate',
    title: 'Débat de classe',
    text(state, npc){ return `Un débat éclate en classe sur la stratégie à adopter pour le prochain examen collectif. ${npc.fullName} attend votre avis.`; },
    weight: 6,
    choices: [
      { label:'Proposer une stratégie collective réfléchie', sub:'+réputation, +relation avec toute la classe', apply(state, npc){
          state.player.stats.reputation = clamp(state.player.stats.reputation + 2, 0, 100);
          Object.keys(state.player.relationships).forEach(id => adjustRelation(state, id, { affinity: 2 }));
          bumpStyle(state, 'leader', 3);
          return `Votre proposition rallie la classe. ${npc.fullName} approuve chaleureusement.`;
        }},
      { label:'Rester en retrait et observer', sub:'+sang-froid, informations passives', apply(state, npc){
          state.player.stats.sangFroid = clamp(state.player.stats.sangFroid + 2, 0, 100);
          bumpStyle(state, 'discret', 2);
          return `Vous observez les dynamiques de la classe sans vous exposer.`;
        }},
      { label:'Imposer votre point de vue avec autorité', sub:'+influence, -relation avec les opposants', apply(state, npc){
          state.player.stats.influence = clamp(state.player.stats.influence + 3, 0, 100);
          adjustRelation(state, npc.id, { affinity: -6 });
          bumpStyle(state, 'combattant', 2);
          return `Vous forcez la décision. Tout le monde ne l'apprécie pas.`;
        }}
    ]
  },
  {
    id: 'ev_moral_dilemma_injured',
    title: 'Dilemme moral',
    text(state, npc){ return `Vous surprenez ${npc.fullName}, un(e) rival(e) déclaré(e), en difficulté et vulnérable — personne d'autre ne le sait encore.`; },
    weight: 5,
    requires(state, npc){ const rel = getRel(state, npc.id); return rel.type === 'rival' || rel.type === 'ennemi'; },
    choices: [
      { label:'L\'aider malgré tout', sub:'+réputation, +relation, contredit votre image de rival', apply(state, npc){
          state.player.stats.reputation = clamp(state.player.stats.reputation + 4, 0, 100);
          adjustRelation(state, npc.id, { affinity: 20, trust: 15 });
          return `${npc.fullName} n'oubliera pas ce geste inattendu.`;
        }},
      { label:'Profiter de sa faiblesse', sub:'+influence, relation détruite durablement', apply(state, npc){
          state.player.stats.influence = clamp(state.player.stats.influence + 4, 0, 100);
          adjustRelation(state, npc.id, { affinity: -30, fear: 15 });
          getRel(state, npc.id).type = 'ennemi';
          return `Vous exploitez la situation sans scrupule. ${npc.fullName} ne vous le pardonnera jamais.`;
        }},
      { label:'Passer votre chemin, indifférent(e)', sub:'Aucun effet direct', apply(state, npc){
          return `Vous choisissez de ne pas vous en mêler.`;
        }}
    ]
  },
  {
    id: 'ev_teacher_summon',
    title: 'Convocation d\'un enseignant',
    text(){ return `Un enseignant vous convoque pour discuter de votre comportement et de vos résultats récents.`; },
    weight: 5,
    choices: [
      { label:'Se montrer coopératif et rassurant', sub:'+réputation légère', apply(state){
          state.player.stats.reputation = clamp(state.player.stats.reputation + 2, 0, 100);
          return `L'entretien se passe bien. Votre dossier reste propre.`;
        }},
      { label:'Rester évasif sur vos intentions', sub:'+sang-froid, réputation stagnante', apply(state){
          state.player.stats.sangFroid = clamp(state.player.stats.sangFroid + 2, 0, 100);
          return `Vous ne révélez rien de compromettant. L'enseignant reste perplexe.`;
        }}
    ]
  },
  {
    id: 'ev_weekend_outing',
    title: 'Sortie du week-end',
    text(state, npc){ return `${npc.fullName} organise une sortie informelle ce week-end et vous y invite.`; },
    weight: 6,
    choices: [
      { label:'Participer pleinement', sub:'+relation avec plusieurs élèves, +popularité', apply(state, npc){
          adjustRelation(state, npc.id, { affinity: 10, trust: 5 });
          state.player.stats.popularite = clamp(state.player.stats.popularite + 2, 0, 100);
          return `La sortie se passe à merveille et renforce votre réseau social.`;
        }},
      { label:'Décliner pour se concentrer sur les études', sub:'+intelligence légère', apply(state, npc){
          state.player.stats.intelligence = clamp(state.player.stats.intelligence + 1, 0, 100);
          adjustRelation(state, npc.id, { affinity: -3 });
          return `Vous préférez réviser. ${npc.fullName} comprend, mais est un peu déçu(e).`;
        }}
    ]
  },
  {
    id: 'ev_ally_warning',
    title: 'Avertissement d\'un allié',
    text(state, npc){ return `${npc.fullName} vous met en garde discrètement : quelqu'un préparerait un mauvais coup contre vous.`; },
    weight: 4,
    requires(state, npc){ return getRel(state, npc.id).affinity >= 30; },
    choices: [
      { label:'Le remercier et enquêter prudemment', sub:'+relation, +chance de découvrir un secret', apply(state, npc){
          adjustRelation(state, npc.id, { affinity: 8, trust: 8 });
          if (Math.random() < 0.5){
            const pool = state.npcs.filter(n => n.id !== npc.id && n.status==='actif' && !state.player.knownSecrets.includes(n.id));
            if (pool.length){
              const t = pick(pool);
              state.player.knownSecrets.push(t.id);
              state.stats_meta.secretsDiscovered++;
              return `Votre enquête discrète révèle un secret sur ${t.fullName}, probablement lié à la menace.`;
            }
          }
          return `Vous restez sur vos gardes, mais ne trouvez rien de concret pour l'instant.`;
        }},
      { label:'Ignorer l\'avertissement', sub:'Aucun effet immédiat, risque latent', apply(state, npc){
          adjustRelation(state, npc.id, { affinity: -4 });
          return `Vous balayez l'avertissement d'un revers de main. ${npc.fullName} n'insiste pas.`;
        }}
    ]
  },
  {
    id: 'ev_conflict_mediation',
    title: 'Conflit entre camarades',
    text(state, npc){
      const others = state.npcs.filter(n => n.id !== npc.id && n.classId === npc.classId && n.status==='actif');
      const other = others.length ? pick(others) : null;
      npc._conflictOther = other;
      return other
        ? `${npc.fullName} et ${other.fullName} s'affrontent ouvertement en classe, chacun cherchant à vous rallier à sa cause.`
        : `${npc.fullName} traverse un conflit tendu avec un autre élève et attend une prise de position de votre part.`;
    },
    weight: 8,
    choices: [
      { label:'Prendre parti pour lui/elle', sub:'+relation avec le PNJ, tension avec l\'autre camp', apply(state, npc){
          adjustRelation(state, npc.id, { affinity: 14, trust: 6 });
          const other = npc._conflictOther;
          if (other) adjustRelation(state, other.id, { affinity: -10 });
          bumpStyle(state, 'leader', 2);
          rememberNpc(state, npc, `Vous avez pris son parti dans un conflit ouvert.`);
          return `${npc.fullName} apprécie votre soutien. Le camp adverse s'en souvient aussi, mais différemment.`;
        }},
      { label:'Jouer les médiateurs', sub:'+sang-froid, +réputation, résultat incertain', apply(state, npc){
          const chance = clamp(0.3 + state.player.stats.charisme/220 + state.player.stats.sangFroid/260, 0.1, 0.85);
          state.player.stats.sangFroid = clamp(state.player.stats.sangFroid + 2, 0, 100);
          if (Math.random() < chance){
            state.player.stats.reputation = clamp(state.player.stats.reputation + 3, 0, 100);
            adjustRelation(state, npc.id, { affinity: 6 });
            bumpStyle(state, 'leader', 2);
            return `Votre médiation apaise durablement la situation. Les deux camps vous en sont reconnaissants.`;
          }
          state.player.stats.reputation = clamp(state.player.stats.reputation - 2, 0, 100);
          return `Votre tentative de médiation échoue : personne n'est réellement satisfait.`;
        }},
      { label:'Alimenter discrètement la discorde', sub:'+influence, moralement trouble', apply(state, npc){
          const other = npc._conflictOther;
          adjustRelation(state, npc.id, { trust: -4 });
          if (other) adjustRelation(state, other.id, { trust: -4 });
          state.player.stats.influence = clamp(state.player.stats.influence + 4, 0, 100);
          bumpStyle(state, 'manipulateur', 4);
          rememberNpc(state, npc, `Semble avoir subtilement envenimé ce conflit.`);
          return `Vous attisez discrètement les braises. Le conflit s'enlise, et vous en tirez un avantage tranquille.`;
        }}
    ]
  },
  {
    id: 'ev_black_market_deal',
    title: 'Offre du marché noir',
    text(state, npc){ return `${npc.fullName} vous glisse qu'un contact discret propose un lot d'informations rares — mais l'offre ne durera pas.`; },
    weight: 5,
    choices: [
      { label:'Saisir l\'occasion (180 pts)', sub:'Révèle un secret garanti, coût immédiat', apply(state, npc){
          if (state.player.points < 180) return `Vous n'avez pas assez de points pour saisir cette offre.`;
          state.player.points -= 180;
          const pool = state.npcs.filter(n => !state.player.knownSecrets.includes(n.id) && n.status==='actif');
          if (pool.length){
            const t = pick(pool);
            state.player.knownSecrets.push(t.id);
            state.stats_meta.secretsDiscovered++;
            bumpStyle(state, 'discret', 2);
            return `Le contact tient parole : vous obtenez un secret garanti sur ${t.fullName}.`;
          }
          return `Le contact n'avait finalement plus rien d'inédit à vendre.`;
        }},
      { label:'Se méfier et refuser', sub:'Aucun effet', apply(state, npc){
          return `Vous préférez ne pas vous compromettre dans cette affaire trouble.`;
        }}
    ]
  },
  {
    id: 'ev_setup_trap',
    title: 'Un piège se referme',
    text(state, npc){ return `Vous réalisez trop tard qu'une situation orchestrée par ${npc.fullName} vous a mis·e en porte-à-faux devant témoins.`; },
    weight: 5,
    requires(state, npc){ const rel = getRel(state, npc.id); return rel.type === 'rival' || rel.type === 'ennemi'; },
    choices: [
      { label:'Garder son sang-froid et retourner la situation', sub:'Dépend du sang-froid et de la chance', apply(state, npc){
          const chance = clamp(0.25 + state.player.stats.sangFroid/220 + state.player.stats.chance/260, 0.1, 0.85);
          if (Math.random() < chance){
            state.player.stats.reputation = clamp(state.player.stats.reputation + 3, 0, 100);
            adjustRelation(state, npc.id, { affinity: -5 });
            bumpStyle(state, 'strategue', 3);
            rememberNpc(state, npc, `A vu son piège se retourner contre vous... sans succès.`);
            return `Vous déjouez le piège avec sang-froid et retournez la situation à votre avantage.`;
          }
          state.player.stats.reputation = clamp(state.player.stats.reputation - 6, 0, 100);
          rememberNpc(state, npc, `A réussi un coup monté contre vous.`);
          return `Le piège fonctionne. Votre réputation en prend un coup devant toute la classe.`;
        }},
      { label:'Encaisser sans réagir', sub:'Perte de réputation limitée mais certaine', apply(state, npc){
          state.player.stats.reputation = clamp(state.player.stats.reputation - 2, 0, 100);
          bumpStyle(state, 'discret', 1);
          return `Vous encaissez sans faire de vagues. L'incident sera vite oublié... ou presque.`;
        }}
    ]
  },
  {
    id: 'ev_sudden_challenge',
    title: 'Défi improvisé',
    text(state, npc){ return `${npc.fullName} vous met au défi, devant témoins, sur un terrain qu'il/elle maîtrise visiblement bien.`; },
    weight: 6,
    choices: [
      { label:'Relever le défi physique', sub:'Dépend de la force et de l\'endurance', apply(state, npc){
          const chance = clamp(0.3 + state.player.stats.force/220 + state.player.stats.endurance/260, 0.1, 0.85);
          bumpStyle(state, 'combattant', 3);
          if (Math.random() < chance){
            state.player.stats.popularite = clamp(state.player.stats.popularite + 4, 0, 100);
            adjustRelation(state, npc.id, { affinity: -3 });
            return `Vous l'emportez nettement. ${npc.fullName} doit ravaler sa fierté devant tout le monde.`;
          }
          state.player.stats.reputation = clamp(state.player.stats.reputation - 3, 0, 100);
          return `Vous perdez ce défi improvisé, sous les regards amusés des autres élèves.`;
        }},
      { label:'Retourner le défi en joute verbale', sub:'Dépend du charisme et du sang-froid', apply(state, npc){
          const chance = clamp(0.3 + state.player.stats.charisme/220 + state.player.stats.sangFroid/260, 0.1, 0.85);
          bumpStyle(state, 'leader', 2);
          if (Math.random() < chance){
            state.player.stats.popularite = clamp(state.player.stats.popularite + 3, 0, 100);
            return `Votre repartie retourne la salle en votre faveur. ${npc.fullName} n'a rien vu venir.`;
          }
          adjustRelation(state, npc.id, { affinity: -4 });
          return `Votre réplique tombe à plat. Un moment gênant pour vous.`;
        }},
      { label:'Décliner poliment', sub:'Neutre, évite le risque', apply(state, npc){
          bumpStyle(state, 'discret', 1);
          return `Vous déclinez avec calme. ${npc.fullName} hausse les épaules, un peu déçu(e).`;
        }}
    ]
  },
  {
    id: 'ev_rumor_against_you',
    title: 'Rumeur hostile en circulation',
    text(state, npc){ return `Vous apprenez que ${npc.fullName} répand une rumeur peu flatteuse à votre sujet dans toute la classe.`; },
    weight: 6,
    requires(state, npc){ const rel = getRel(state, npc.id); return rel.type === 'rival' || rel.type === 'ennemi' || rel.affinity < -10; },
    choices: [
      { label:'Confronter directement', sub:'Risqué, mais peut faire taire la rumeur', apply(state, npc){
          const chance = clamp(0.3 + state.player.stats.charisme/220 + state.player.stats.influence/260, 0.1, 0.85);
          bumpStyle(state, 'combattant', 2);
          if (Math.random() < chance){
            adjustRelation(state, npc.id, { affinity: -8, fear: 8 });
            rememberNpc(state, npc, `A été confronté(e) directement au sujet d'une rumeur qu'il/elle propageait.`);
            return `Face à face, ${npc.fullName} recule et la rumeur se dégonfle rapidement.`;
          }
          state.player.stats.reputation = clamp(state.player.stats.reputation - 3, 0, 100);
          return `La confrontation tourne mal et alimente encore davantage la rumeur.`;
        }},
      { label:'Répandre une contre-rumeur', sub:'+influence, escalade risquée', apply(state, npc){
          state.player.stats.influence = clamp(state.player.stats.influence + 3, 0, 100);
          adjustRelation(state, npc.id, { affinity: -12, trust: -10 });
          bumpStyle(state, 'manipulateur', 3);
          rememberNpc(state, npc, `Vous a répliqué par une contre-rumeur bien sentie.`);
          return `Vous ripostez par une rumeur tout aussi habile. La guerre de l'ombre est déclarée.`;
        }},
      { label:'Laisser le temps faire son œuvre', sub:'+sang-froid, aucune escalade', apply(state, npc){
          state.player.stats.sangFroid = clamp(state.player.stats.sangFroid + 2, 0, 100);
          bumpStyle(state, 'discret', 2);
          return `Vous choisissez d'ignorer la rumeur. Elle finit par s'essouffler d'elle-même.`;
        }}
    ]
  }
];

/** Sélectionne et déclenche un événement hebdomadaire aléatoire (probabiliste). */
function maybeTriggerWeeklyEvent(state){
  if (Math.random() > 0.55) return null; // 55% de chance d'événement par semaine
  const active = state.npcs.filter(n => n.status === 'actif');
  const candidates = WEEKLY_EVENTS.filter(ev => !ev.requires || active.some(n => {
    try { return ev.requires(state, n); } catch(e){ return ev.requires(state); }
  }));
  if (!candidates.length) return null;
  const ev = weightedChoice(candidates.map(e => [e, e.weight || 5]));

  let npc;
  if (ev.pickNpc) npc = ev.pickNpc(state);
  else {
    const pool = ev.requires ? active.filter(n => { try { return ev.requires(state, n); } catch(e){ return true; } }) : active;
    npc = pick(pool.length ? pool : active);
  }
  if (!npc) return null;
  return { event: ev, npc };
}

/* ================================================================
   8. IA AUTONOME DES PNJ (simulation sans intervention du joueur)
   ================================================================ */

function simulateNpcWeek(state){
  const active = state.npcs.filter(n => n.status === 'actif');

  // 1. interactions aléatoires entre PNJ (évolution des liens sociaux)
  for (let i = 0; i < 14; i++){
    const a = pick(active);
    const compatiblePool = active.filter(n => n.id !== a.id && n.classId === a.classId);
    if (!compatiblePool.length) continue;
    const b = pick(compatiblePool);
    const sameTraits = a.traits.filter(t => b.traits.includes(t)).length;
    const delta = rndInt(-4, 6) + sameTraits * 3;
    a.bonds[b.id] = clamp((a.bonds[b.id] || 0) + delta, -100, 100);
    b.bonds[a.id] = clamp((b.bonds[a.id] || 0) + delta, -100, 100);

    // formation spontanée d'alliance
    if (a.bonds[b.id] > 65 && !a.allianceId && !b.allianceId && Math.random() < 0.08){
      const allianceId = uid('alliance');
      a.allianceId = allianceId; b.allianceId = allianceId;
    }
    // rupture / trahison spontanée
    if (a.bonds[b.id] < -55 && Math.random() < 0.05 && a.allianceId && a.allianceId === b.allianceId){
      a.allianceId = null; b.allianceId = null;
      a.history.push(`Rupture avec ${b.fullName}`);
    }
  }

  // 2. dérive lente de l'humeur et rumeurs concernant le joueur
  active.forEach(n => {
    n.mood = clamp(n.mood + rndInt(-3, 3), 5, 100);
    if (n.opinionOfPlayer !== 0 && Math.random() < 0.04){
      // une rumeur (positive ou négative selon l'opinion) circule un peu
      const spread = Math.sign(n.opinionOfPlayer) * rndInt(1, 3);
      n.opinionOfPlayer = clamp(n.opinionOfPlayer + spread, -100, 100);
    }
  });

  // 3. chance qu'un secret du joueur (s'il en a un flag) fuite via un PNJ hostile — hook narratif simple
  // 4. légère dérive naturelle des stats des PNJ (ils progressent aussi, indépendamment du joueur)
  active.forEach(n => {
    if (Math.random() < 0.3){
      const stat = pick(STAT_KEYS);
      n.stats[stat] = clamp(n.stats[stat] + rndInt(0, 2), 0, 100);
    }
  });
}

/* ================================================================
   9. BOUTIQUE / INVENTAIRE
   ================================================================ */

/* ---------- Texte narratif de transition d'année / fin de partie ---------- */
const YEAR_INTRO_FLAVOR = {
  2: "Une nouvelle année débute à ANHS. Les visages familiers ont changé — certains se sont endurcis, d'autres ont disparu des couloirs sans explication officielle.",
  3: "Dernière année. L'administration ne cache plus que les meilleurs éléments seront observés de près pour l'après-ANHS. Chaque décision pèse désormais double."
};

const ENDING_FLAVOR = [
  { minPoints: 1500, minClass: 'A', text: "Votre dossier quitte ANHS auréolé de succès : Classe A, réputation impeccable, réseau tentaculaire. On se souviendra de vous — pour les bonnes raisons, ou presque." },
  { minPoints: 800,  minClass: 'B', text: "Vous achevez votre parcours dans une position solide, respecté(e) sans être une légende. Un dossier honorable, qui ouvre des portes sans en garantir aucune." },
  { minPoints: 0,    minClass: 'D', text: "Votre dossier se referme discrètement, sans éclat particulier. À ANHS, l'oubli est parfois la seule échappatoire à l'échec." }
];

function getEndingFlavor(state){
  const classRank = { A:0, B:1, C:2, D:3 }[state.player.classId];
  const sorted = ENDING_FLAVOR.slice().sort((a,b) => a.minPoints - b.minPoints);
  let best = sorted[0];
  sorted.forEach(f => {
    const fRank = { A:0, B:1, C:2, D:3 }[f.minClass];
    if (state.player.points >= f.minPoints && classRank <= fRank) best = f;
  });
  const dominant = getDominantStyle(state);
  const styleText = dominant ? ` Votre dossier restera marqué du sceau du « ${dominant.label} » : ${STYLE_DESC[dominant.key]}` : '';
  return best.text + styleText;
}

const SHOP_ITEMS = [
  { id:'item_notes', name:'Notes de cours premium', price:180, desc:'+2 Intelligence immédiatement.', apply(state){ state.player.stats.intelligence = clamp(state.player.stats.intelligence+2,0,100); } },
  { id:'item_energy', name:'Programme d\'entraînement privé', price:220, desc:'+2 Force, +1 Endurance.', apply(state){ state.player.stats.force = clamp(state.player.stats.force+2,0,100); state.player.stats.endurance = clamp(state.player.stats.endurance+1,0,100); } },
  { id:'item_style', name:'Relooking complet', price:260, desc:'+3 Charisme, +2 Popularité.', apply(state){ state.player.stats.charisme = clamp(state.player.stats.charisme+3,0,100); state.player.stats.popularite = clamp(state.player.stats.popularite+2,0,100); } },
  { id:'item_intel', name:'Dossier d\'informations générales', price:300, desc:'Révèle un secret aléatoire sur un élève.', apply(state){
      const pool = state.npcs.filter(n => !state.player.knownSecrets.includes(n.id));
      if (pool.length){ const t = pick(pool); state.player.knownSecrets.push(t.id); state.stats_meta.secretsDiscovered++; addJournalEntry(state, `Le dossier acheté révèle un secret sur ${t.fullName}.`, 'secret'); }
    }},
  { id:'item_comfort', name:'Amélioration de la chambre', price:400, desc:'+3 Sang-froid, +2 Endurance (confort accru).', apply(state){ state.player.stats.sangFroid = clamp(state.player.stats.sangFroid+3,0,100); state.player.stats.endurance = clamp(state.player.stats.endurance+2,0,100); } },
  { id:'item_luck', name:'Amulette « porte-bonheur »', price:150, desc:'+2 Chance. Probablement du marketing. Probablement.', apply(state){ state.player.stats.chance = clamp(state.player.stats.chance+2,0,100); } },
  { id:'item_influence', name:'Réseau de contacts', price:350, desc:'+3 Influence.', apply(state){ state.player.stats.influence = clamp(state.player.stats.influence+3,0,100); } },
  { id:'item_reputation', name:'Don caritatif discret', price:280, desc:'+3 Réputation.', apply(state){ state.player.stats.reputation = clamp(state.player.stats.reputation+3,0,100); } },
  { id:'item_gift_targeted', name:'Cadeau personnalisé', price:240, desc:'Améliore fortement la relation avec un élève au hasard de votre classe.', apply(state){
      const pool = state.npcs.filter(n => n.classId === state.player.classId && n.status==='actif');
      if (pool.length){ const t = pick(pool); adjustRelation(state, t.id, { affinity: 18, trust: 10 }); addJournalEntry(state, `Votre cadeau personnalisé touche ${t.fullName} en plein cœur.`, 'shop'); }
    }},
  { id:'item_alibi', name:'Alibi en béton', price:320, desc:'Réduit le risque d\'être découvert(e) lors d\'une tricherie ou d\'un sabotage pendant 4 semaines.', apply(state){
      state.player.flags.alibiWeeksLeft = (state.player.flags.alibiWeeksLeft || 0) + 4;
    }},
  { id:'item_mental_training', name:'Coaching mental intensif', price:300, desc:'+3 Sang-froid, +1 Intelligence.', apply(state){ state.player.stats.sangFroid = clamp(state.player.stats.sangFroid+3,0,100); state.player.stats.intelligence = clamp(state.player.stats.intelligence+1,0,100); } },
  { id:'item_scandal_insurance', name:'Assurance anti-scandale', price:260, desc:'Limite la perte de réputation si un de vos secrets est révélé prochainement.', apply(state){
      state.player.flags.scandalInsurance = true;
    }},
  { id:'item_master_dossier', name:'Dossier confidentiel complet', price:520, stock:1, desc:'RARE (stock unique) — Révèle immédiatement les secrets de trois élèves différents.', apply(state){
      const pool = state.npcs.filter(n => !state.player.knownSecrets.includes(n.id) && n.status==='actif');
      const targets = pickN(pool, Math.min(3, pool.length));
      targets.forEach(t => { state.player.knownSecrets.push(t.id); state.stats_meta.secretsDiscovered++; });
      if (targets.length) addJournalEntry(state, `Le dossier confidentiel révèle les secrets de ${targets.map(t=>t.fullName).join(', ')}.`, 'secret');
    }},
  { id:'item_founder_ring', name:'Anneau du fondateur', price:600, stock:1, desc:'RARE (stock unique) — Objet légendaire : +2 dans toutes les statistiques.', apply(state){
      STAT_KEYS.forEach(k => { state.player.stats[k] = clamp(state.player.stats[k] + 2, 0, 100); });
    }},
  { id:'item_forged_records', name:'Dossier scolaire falsifié', price:340, stock:2, desc:'RARE (stock limité) — Efface un échec d\'examen de votre historique visible et restaure un peu de réputation.', apply(state){
      if (state.player.examHistory.length){
        const idx = state.player.examHistory.map(h=>h.tier).lastIndexOf('echec');
        if (idx !== -1) state.player.examHistory.splice(idx, 1);
      }
      state.player.stats.reputation = clamp(state.player.stats.reputation + 4, 0, 100);
    }}
];

/* ================================================================
   9bis. OBJECTIFS CACHÉS (achievements narratifs à récompense)
   ------------------------------------------------------------
   Chaque objectif reste invisible tant qu'il n'est pas rempli.
   Une fois débloqué, il est consigné au journal, notifié par un
   toast, et récompensé (points et/ou statistiques).
   ================================================================ */
const ACHIEVEMENTS = [
  {
    id: 'ach_first_secret',
    name: 'Premier pas dans l\'ombre',
    desc: 'Découvrir votre tout premier secret sur un(e) camarade.',
    check(state){ return state.stats_meta.secretsDiscovered >= 1; },
    reward(state){ state.player.points += 80; return 'Récompense : +80 points.'; }
  },
  {
    id: 'ach_alliance_architect',
    name: 'Architecte d\'alliances',
    desc: 'Former trois alliances au cours de votre scolarité.',
    check(state){ return state.stats_meta.alliancesFormed >= 3; },
    reward(state){ state.player.points += 150; state.player.stats.influence = clamp(state.player.stats.influence+3,0,100); return 'Récompense : +150 points, +3 Influence.'; }
  },
  {
    id: 'ach_cold_blade',
    name: 'La lame après la révérence',
    desc: 'Trahir un(e) allié(e) pour la première fois.',
    check(state){ return state.stats_meta.betrayals >= 1; },
    reward(state){ state.player.stats.sangFroid = clamp(state.player.stats.sangFroid+2,0,100); return 'Récompense : +2 Sang-froid.'; }
  },
  {
    id: 'ach_ruthless',
    name: 'Sans pitié',
    desc: 'Trahir trois allié(e)s différent(e)s.',
    check(state){ return state.stats_meta.betrayals >= 3; },
    reward(state){ state.player.points += 150; state.player.stats.influence = clamp(state.player.stats.influence+3,0,100); return 'Récompense : +150 points, +3 Influence.'; }
  },
  {
    id: 'ach_veteran_strategist',
    name: 'Stratège éprouvé',
    desc: 'Compléter cinq examens spéciaux, quel qu\'en soit le résultat.',
    check(state){ return state.stats_meta.examsCompleted >= 5; },
    reward(state){ state.player.points += 200; state.player.stats.intelligence = clamp(state.player.stats.intelligence+2,0,100); return 'Récompense : +200 points, +2 Intelligence.'; }
  },
  {
    id: 'ach_secret_collector',
    name: 'Collectionneur de secrets',
    desc: 'Connaître les secrets de huit élèves différents.',
    check(state){ return state.player.knownSecrets.length >= 8; },
    reward(state){ state.player.points += 250; state.player.stats.influence = clamp(state.player.stats.influence+3,0,100); return 'Récompense : +250 points, +3 Influence.'; }
  },
  {
    id: 'ach_wide_network',
    name: 'Réseau tentaculaire',
    desc: 'Entretenir une relation forte (affinité 50+) avec au moins six élèves.',
    check(state){ return Object.values(state.player.relationships).filter(r => r.affinity >= 50).length >= 6; },
    reward(state){ state.player.points += 200; state.player.stats.charisme = clamp(state.player.stats.charisme+2,0,100); return 'Récompense : +200 points, +2 Charisme.'; }
  },
  {
    id: 'ach_class_a',
    name: 'Ombre de la Classe A',
    desc: 'Intégrer la classe A, sommet de la hiérarchie scolaire.',
    check(state){ return state.player.classId === 'A'; },
    reward(state){ state.player.points += 300; state.player.stats.reputation = clamp(state.player.stats.reputation+3,0,100); return 'Récompense : +300 points, +3 Réputation.'; }
  },
  {
    id: 'ach_second_year',
    name: 'Survivant de première année',
    desc: 'Atteindre la deuxième année à ANHS.',
    check(state){ return state.time.year >= 2; },
    reward(state){ state.player.points += 150; return 'Récompense : +150 points.'; }
  },
  {
    id: 'ach_legend',
    name: 'Légende de l\'académie',
    desc: 'Achever votre parcours à ANHS avec plus de 1500 points personnels.',
    check(state){ return state.gameOver && state.player.points >= 1500; },
    reward(state){ state.player.points += 500; return 'Récompense : +500 points.'; }
  }
];

/** Vérifie et débloque les objectifs cachés nouvellement remplis. Doit être appelée après toute action majeure. */
function checkAchievements(state){
  const unlocked = [];
  ACHIEVEMENTS.forEach(ach => {
    if (state.player.unlockedAchievements.includes(ach.id)) return;
    let met = false;
    try { met = ach.check(state); } catch(e){ met = false; }
    if (!met) return;
    state.player.unlockedAchievements.push(ach.id);
    const rewardText = ach.reward ? ach.reward(state) : '';
    addJournalEntry(state, `Objectif débloqué — « ${ach.name} » : ${ach.desc} ${rewardText}`, 'objectif');
    unlocked.push(ach);
  });
  return unlocked;
}

/* ================================================================
   10. CONTRÔLEUR DE JEU (Game)
   ================================================================ */

const Game = {
  state: null,

  init(state){
    // Migration douce des sauvegardes antérieures à l'ajout du profil stratégique,
    // de la mémoire des PNJ et du stock de boutique limité.
    if (!state.player.playstyle){
      state.player.playstyle = { manipulateur:0, leader:0, strategue:0, combattant:0, discret:0 };
    }
    if (state.player.lastJournalSeenCount == null) state.player.lastJournalSeenCount = state.player.journal.length;
    if (!state.shopStock) state.shopStock = SHOP_ITEMS.reduce((acc, it) => { if (it.stock != null) acc[it.id] = it.stock; return acc; }, {});
    (state.npcs || []).forEach(n => { if (!n.memory) n.memory = []; });
    this.state = state;
  },

  /** Planifie les examens d'une nouvelle année scolaire (dates réparties sur 28 semaines). */
  scheduleYearExams(){
    const s = this.state;
    const pool = pickN(EXAM_LIBRARY, Math.min(6, EXAM_LIBRARY.length));
    const weeks = pickN(
      Array.from({length: WEEKS_PER_YEAR - 2}, (_,i)=>i+2), // évite semaine 1
      pool.length
    ).sort((a,b)=>a-b);
    s.scheduledExams = pool.map((exam, i) => ({ examId: exam.id, week: weeks[i] }));
  },

  currentSeason(){
    const idx = Math.floor((this.state.time.week - 1) / (WEEKS_PER_YEAR / 4)) % 4;
    return SEASONS[idx];
  },

  /** Retourne l'examen programmé pour la semaine courante, s'il y en a un. */
  getExamForThisWeek(){
    const s = this.state;
    const entry = s.scheduledExams.find(e => e.week === s.time.week);
    if (!entry) return null;
    return EXAM_LIBRARY.find(e => e.id === entry.examId);
  },

  /** Applique les gains liés au planning hebdomadaire choisi par le joueur. */
  applyPlanningGains(){
    const s = this.state;
    let pointsGained = 0;
    const statTotals = {};
    Object.values(s.planning).forEach(actId => {
      const act = ACTIVITIES[actId];
      if (!act) return;
      Object.entries(act.stats).forEach(([k,v]) => { statTotals[k] = (statTotals[k]||0) + v; });
      if (act.points) pointsGained += act.points;
    });
    Object.entries(statTotals).forEach(([k,v]) => {
      s.player.stats[k] = clamp(s.player.stats[k] + Math.round(v/2), 0, 100);
    });
    if (pointsGained){
      s.player.points += pointsGained;
    }
    // espionnage planifié -> chance de découvrir un secret d'un camarade de classe au hasard
    if (Object.values(s.planning).includes('espionner')){
      const pool = s.npcs.filter(n => !s.player.knownSecrets.includes(n.id) && n.status==='actif');
      if (pool.length && Math.random() < 0.35){
        const target = pick(pool);
        investigateSecretDirect(s, target.id);
      }
    }
    return { pointsGained, statTotals };
  },

  /** Fait progresser le temps d'une semaine complète : planning, examen éventuel, événement, IA, sauvegarde. */
  advanceWeek(){
    const s = this.state;
    if (s.gameOver) return { ended:true };

    if (s.player.flags.alibiWeeksLeft > 0) s.player.flags.alibiWeeksLeft--;

    const planningResult = this.applyPlanningGains();

    let examResult = null;
    const exam = this.getExamForThisWeek();
    if (exam) examResult = { exam };

    simulateNpcWeek(s);

    let weeklyEvent = null;
    if (!exam){ weeklyEvent = maybeTriggerWeeklyEvent(s); }

    s.time.week++;
    let yearEnded = false;
    if (s.time.week > WEEKS_PER_YEAR){
      yearEnded = true;
      this.endOfYear();
    }
    s.time.season = this.currentSeason();

    const unlockedAchievements = checkAchievements(s);

    SaveManager.save(s);

    return { planningResult, examResult, weeklyEvent, yearEnded, unlockedAchievements };
  },

  /** Traite la fin d'année : classement des classes, promotion/rétrogradation, éventuelle expulsion narrative. */
  endOfYear(){
    const s = this.state;
    const ranking = CLASS_IDS.slice().sort((a,b) => s.classPoints[b] - s.classPoints[a]);
    const oldClass = s.player.classId;
    const playerRankPos = ranking.indexOf(oldClass);

    addJournalEntry(s, `Fin de l'année ${s.time.year}. Classement des classes : ${ranking.map(c=>'Classe '+c).join(' > ')}.`, 'system');

    // réattribution simple : la classe du joueur peut changer de rang selon sa position relative
    let newClassId = oldClass;
    if (playerRankPos === 0 && oldClass !== 'A'){
      newClassId = CLASS_IDS[CLASS_IDS.indexOf(oldClass) - 1];
    } else if (playerRankPos === ranking.length - 1 && oldClass !== 'D'){
      // dernière place: risque de rétrogradation si points personnels très faibles
      if (s.player.points < 250) newClassId = CLASS_IDS[Math.min(CLASS_IDS.indexOf(oldClass)+1, 3)];
    }
    if (newClassId !== oldClass){
      s.player.classId = newClassId;
      addJournalEntry(s, `Votre classe change : vous intégrez désormais la classe ${s.time.year+1}-${newClassId}.`, 'majeur');
      toast(`Nouvelle affectation : Classe ${newClassId} !`, newClassId < oldClass ? 'good' : 'bad');
    }

    // léger reset des points de classe pour la nouvelle année, en gardant un historique relatif
    CLASS_IDS.forEach(c => { s.classPoints[c] = Math.round(s.classPoints[c]*0.6 + 300); });

    s.time.year++;
    s.time.week = 1;

    if (s.time.year > MAX_YEARS){
      s.gameOver = true;
      addJournalEntry(s, `Vous achevez votre parcours à ANHS. Dossier final scellé. ${getEndingFlavor(s)}`, 'system');
    } else {
      if (YEAR_INTRO_FLAVOR[s.time.year]) addJournalEntry(s, YEAR_INTRO_FLAVOR[s.time.year], 'system');
      this.scheduleYearExams();
    }
  }
};

/** Variante "directe" (hors planning) d'investigation de secret, sans dépendre des stats d'appel UI. */
function investigateSecretDirect(state, npcId){
  const npc = getNpc(state, npcId);
  if (!npc) return false;
  if (!state.player.knownSecrets.includes(npcId)){
    state.player.knownSecrets.push(npcId);
    state.stats_meta.secretsDiscovered++;
    addJournalEntry(state, `En menant votre enquête, vous découvrez un secret sur ${npc.fullName}.`, 'secret');
  }
  return true;
}

/* ================================================================
   11. UI — GESTION DES ÉCRANS
   ================================================================ */

let currentView = 'dashboard';
const createState = {
  name: '', gender: 'X', avatar: AVATARS[0], specialtyId: null,
  allocation: {}, pointsTotal: 12
};
STAT_KEYS.forEach(k => createState.allocation[k] = 0);

function showScreen(id){
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

/* ---------- BOOT ---------- */
function bootSequence(){
  showScreen('screen-boot');
  setTimeout(() => {
    if (SaveManager.exists()) showScreen('screen-menu');
    else showScreen('screen-menu');
    refreshMenuButtons();
  }, 1100);
}

function refreshMenuButtons(){
  document.getElementById('btn-continue').disabled = !SaveManager.exists();
}

/* ---------- CREATION DE PERSONNAGE ---------- */
function renderCreateScreen(){
  // avatars
  const avatarPicker = document.getElementById('avatar-picker');
  avatarPicker.innerHTML = AVATARS.map(a =>
    `<button type="button" class="avatar-opt${a===createState.avatar?' selected':''}" data-avatar="${a}">${a}</button>`
  ).join('');
  avatarPicker.querySelectorAll('.avatar-opt').forEach(btn => {
    btn.addEventListener('click', () => { createState.avatar = btn.dataset.avatar; renderCreateScreen(); });
  });

  // genre
  document.querySelectorAll('#gender-picker .chip').forEach(chip => {
    chip.classList.toggle('selected', chip.dataset.gender === createState.gender);
    chip.onclick = () => { createState.gender = chip.dataset.gender; renderCreateScreen(); };
  });

  // spécialités
  const specGrid = document.getElementById('specialty-grid');
  specGrid.innerHTML = SPECIALTIES.map(sp => `
    <button type="button" class="specialty-opt${createState.specialtyId===sp.id?' selected':''}" data-spec="${sp.id}">
      <div class="so-name">${sp.name}</div>
      <div class="so-tag">${sp.tag}</div>
    </button>`).join('');
  specGrid.querySelectorAll('.specialty-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      createState.specialtyId = btn.dataset.spec;
      renderCreateScreen();
    });
  });
  const descEl = document.getElementById('specialty-desc');
  const chosen = SPECIALTIES.find(s => s.id === createState.specialtyId);
  descEl.textContent = chosen ? chosen.desc : 'Sélectionnez une spécialité pour voir sa description.';

  // stats
  const used = STAT_KEYS.reduce((s,k)=>s+createState.allocation[k],0);
  const remaining = createState.pointsTotal - used;
  document.getElementById('points-remaining').textContent = remaining;

  const allocator = document.getElementById('stat-allocator');
  allocator.innerHTML = STAT_KEYS.map(k => {
    const val = createState.allocation[k];
    const pct = Math.round((val/6)*100);
    return `
    <div class="stat-row">
      <div class="stat-row__top">
        <span class="stat-row__name">${STAT_LABELS[k]}</span>
        <span class="stat-row__val">${10+val}</span>
      </div>
      <div class="stat-row__ctrl">
        <button type="button" class="stat-btn" data-act="minus" data-stat="${k}">−</button>
        <div class="stat-bar"><div class="stat-bar__fill" style="width:${pct}%"></div></div>
        <button type="button" class="stat-btn" data-act="plus" data-stat="${k}">+</button>
      </div>
    </div>`;
  }).join('');
  allocator.querySelectorAll('.stat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const k = btn.dataset.stat;
      const usedNow = STAT_KEYS.reduce((s,kk)=>s+createState.allocation[kk],0);
      if (btn.dataset.act === 'plus' && usedNow < createState.pointsTotal && createState.allocation[k] < 6){
        createState.allocation[k]++;
      } else if (btn.dataset.act === 'minus' && createState.allocation[k] > 0){
        createState.allocation[k]--;
      }
      renderCreateScreen();
    });
  });

  document.getElementById('input-name').value = createState.name;
}

function tryConfirmCreate(){
  const name = document.getElementById('input-name').value.trim();
  if (!name){ toast('Veuillez entrer un nom.', 'bad'); return; }
  if (!createState.specialtyId){ toast('Veuillez choisir une spécialité.', 'bad'); return; }
  createState.name = name;

  const state = createNewGameState(createState);
  Game.init(state);
  Game.scheduleYearExams();
  SaveManager.save(state);
  enterApp();
  toast('Dossier créé avec succès. Bienvenue à ANHS.', 'good');
}

/* ---------- MODALE GÉNÉRIQUE ---------- */
function openModal({ eyebrow, title, bodyHtml, choices, resultHtml, closeLabel }){
  const root = document.getElementById('modal-root');
  root.innerHTML = '';
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const choicesHtml = (choices || []).map((c, i) => `
    <button type="button" class="modal-choice${c.danger ? ' modal-choice--danger' : ''}" data-idx="${i}">
      <div class="modal-choice__title">${escapeHtml(c.label)}</div>
      ${c.sub ? `<div class="modal-choice__sub">${escapeHtml(c.sub)}</div>` : ''}
    </button>`).join('');

  overlay.innerHTML = `
    <div class="modal-box">
      ${eyebrow ? `<div class="modal-eyebrow">${escapeHtml(eyebrow)}</div>` : ''}
      <div class="modal-title">${escapeHtml(title)}</div>
      <div class="modal-body">${bodyHtml}</div>
      ${resultHtml ? `<div class="modal-result">${resultHtml}</div>` : ''}
      ${choicesHtml ? `<div class="modal-choices">${choicesHtml}</div>` : ''}
      <div class="modal-close"><button type="button" class="btn btn--ghost" id="modal-close-btn">${closeLabel || 'Fermer'}</button></div>
    </div>`;
  root.appendChild(overlay);
  SFX.play('open');
  requestAnimationFrame(() => overlay.classList.add('open'));

  overlay.querySelectorAll('.modal-choice').forEach(btn => {
    btn.addEventListener('click', () => {
      SFX.play('click');
      const idx = parseInt(btn.dataset.idx, 10);
      choices[idx].onClick();
    });
  });
  document.getElementById('modal-close-btn').addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
}
function closeModal(){
  const root = document.getElementById('modal-root');
  const overlay = root.querySelector('.modal-overlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  setTimeout(() => { root.innerHTML = ''; }, 200);
}

/* ---------- ENTRÉE DANS L'APPLICATION ---------- */
function enterApp(){
  showScreen('screen-app');
  currentView = 'dashboard';
  _hdrPrev = { points:null, reputation:null };
  document.querySelectorAll('.navbtn[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view===currentView));
  renderHeader();
  renderCurrentView();
}

/** Compte les entrées de journal marquantes non encore consultées et met à jour le badge de l'onglet. */
function renderNavBadge(){
  const s = Game.state;
  const btn = document.querySelector('.navbtn[data-view="journal"]');
  if (!btn || !s) return;
  const IMPORTANT_TYPES = ['majeur','secret','objectif','betrayal','corruption'];
  const unseenCount = s.player.journal.filter((e, i) => i < (s.player.journal.length - (s.player.lastJournalSeenCount||0)) && IMPORTANT_TYPES.includes(e.type)).length;
  const existing = btn.querySelector('.navbtn__badge');
  if (existing) existing.remove();
  if (unseenCount > 0){
    const span = document.createElement('span');
    span.className = 'navbtn__badge';
    span.textContent = unseenCount > 9 ? '9+' : String(unseenCount);
    btn.appendChild(span);
  }
}

const REPUTATION_TIERS = [
  { max:20,  label:'Ignoré',    color:'var(--text-faint)' },
  { max:40,  label:'Discret',   color:'var(--text-dim)' },
  { max:60,  label:'Respecté',  color:'var(--azure)' },
  { max:80,  label:'Redouté',   color:'var(--gold-soft)' },
  { max:101, label:'Légendaire',color:'var(--gold)' }
];
function getReputationTier(v){
  return REPUTATION_TIERS.find(t => v < t.max) || REPUTATION_TIERS[REPUTATION_TIERS.length-1];
}
let _hdrPrev = { points:null, reputation:null };
function flashTicker(el, delta){
  if (delta === 0 || delta == null) return;
  el.classList.remove('flash-good','flash-bad');
  void el.offsetWidth; // relance l'animation
  el.classList.add(delta > 0 ? 'flash-good' : 'flash-bad');
}

function renderHeader(){
  const s = Game.state;
  renderNavBadge();
  document.getElementById('hdr-avatar').textContent = s.player.avatar;
  document.getElementById('hdr-name').textContent = s.player.name;
  const spec = SPECIALTIES.find(sp => sp.id === s.player.specialtyId);
  document.getElementById('hdr-meta').textContent = `${spec ? spec.name : ''} · Classe ${s.time.year}-${s.player.classId}`;

  const pointsEl = document.getElementById('hdr-points');
  pointsEl.textContent = s.player.points.toLocaleString('fr-FR');
  if (_hdrPrev.points !== null) flashTicker(pointsEl, s.player.points - _hdrPrev.points);
  _hdrPrev.points = s.player.points;

  const rep = s.player.stats.reputation;
  const repEl = document.getElementById('hdr-reputation');
  repEl.textContent = rep;
  if (_hdrPrev.reputation !== null) flashTicker(repEl, rep - _hdrPrev.reputation);
  _hdrPrev.reputation = rep;
  const tier = getReputationTier(rep);
  const tierEl = document.getElementById('hdr-reputation-tier');
  tierEl.textContent = tier.label;
  tierEl.style.color = tier.color;

  const classEl = document.getElementById('hdr-class');
  classEl.textContent = `${s.time.year}-${s.player.classId}`;
  classEl.style.color = CLASS_COLOR[s.player.classId];
  document.getElementById('hdr-week').textContent = `${s.time.week} / ${WEEKS_PER_YEAR}`;
  document.getElementById('hdr-year').textContent = s.time.year;
}

function renderCurrentView(){
  const renderers = {
    dashboard: renderDashboard,
    stats: renderStatsView,
    relations: renderRelationsView,
    classroom: renderClassroomView,
    school: renderSchoolView,
    inventory: renderInventoryView,
    planning: renderPlanningView,
    ranking: renderRankingView,
    journal: renderJournalView
  };
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const el = document.getElementById('view-' + currentView);
  el.classList.add('active');
  renderers[currentView]();
}

/* ---------- DASHBOARD ---------- */
function renderDashboard(){
  const s = Game.state;
  const el = document.getElementById('view-dashboard');
  const exam = Game.getExamForThisWeek();
  const nextExamEntry = s.scheduledExams.filter(e => e.week >= s.time.week).sort((a,b)=>a.week-b.week)[0];
  const nextExam = nextExamEntry ? EXAM_LIBRARY.find(e=>e.id===nextExamEntry.examId) : null;

  el.innerHTML = `
    <h2 class="section-title">Tableau de bord — Semaine ${s.time.week}, ${s.time.season} · Année ${s.time.year}</h2>
    <div class="week-progress tt" data-tip="Semaine ${s.time.week} sur ${WEEKS_PER_YEAR} de l'année ${s.time.year}/${MAX_YEARS}.">
      <div class="week-progress__fill" style="width:${Math.round((s.time.week-1)/WEEKS_PER_YEAR*100)}%"></div>
    </div>

    <div class="kpi-row">
      <div class="kpi"><div class="kpi__label">Points personnels</div><div class="kpi__value">${s.player.points.toLocaleString('fr-FR')}</div><div class="kpi__sub">Monnaie, réputation, pouvoir</div></div>
      <div class="kpi"><div class="kpi__label">Classe actuelle</div><div class="kpi__value" style="color:${CLASS_COLOR[s.player.classId]}">${s.time.year}-${s.player.classId}</div><div class="kpi__sub">${CLASS_LABEL[s.player.classId]}</div></div>
      <div class="kpi"><div class="kpi__label">Points de classe</div><div class="kpi__value">${s.classPoints[s.player.classId].toLocaleString('fr-FR')}</div><div class="kpi__sub">Cumul de la classe</div></div>
      <div class="kpi"><div class="kpi__label">Secrets connus</div><div class="kpi__value">${s.player.knownSecrets.length}</div><div class="kpi__sub">Leviers d'influence</div></div>
      <div class="kpi"><div class="kpi__label">Objectifs débloqués</div><div class="kpi__value">${s.player.unlockedAchievements.length}/${ACHIEVEMENTS.length}</div><div class="kpi__sub">Accomplissements cachés</div></div>
    </div>

    <div class="grid-2">
      <div class="panel">
        <div class="panel__title">Cette semaine ${exam ? '<small>Un examen est programmé !</small>' : ''}</div>
        ${exam ? `
          <div class="event-card">
            <div class="event-card__title">${exam.icon} ${exam.name} <span class="event-card__tag">${exam.type}</span></div>
            <div class="event-card__desc">${exam.desc}</div>
          </div>
          <button class="btn btn--primary" id="btn-start-exam" style="width:100%">Se présenter à l'examen</button>
        ` : `
          <p class="text-dim">Aucun examen cette semaine. Suivez votre planning ou ajustez-le avant d'avancer.</p>
          <button class="btn btn--primary" id="btn-advance-week" style="width:100%">Avancer d'une semaine</button>
        `}
      </div>

      <div class="panel">
        <div class="panel__title">Prochain examen prévu</div>
        ${nextExam ? `
          <div class="event-card">
            <div class="event-card__title">${nextExam.icon} ${nextExam.name} <span class="event-card__tag">Semaine ${nextExamEntry.week}</span></div>
            <div class="event-card__desc">${nextExam.desc}</div>
          </div>` : `<p class="empty-state">Aucun autre examen prévu pour cette année.</p>`}
      </div>
    </div>

    <div class="panel">
      <div class="panel__title">Dernières nouvelles <small>Journal complet dans l'onglet dédié</small></div>
      <div id="dash-journal"></div>
    </div>
  `;

  const journalWrap = document.getElementById('dash-journal');
  const entries = s.player.journal.slice(0, 4);
  journalWrap.innerHTML = entries.length ? entries.map(journalEntryHtml).join('') : `<div class="empty-state">Rien à signaler pour l'instant.</div>`;

  const advBtn = document.getElementById('btn-advance-week');
  if (advBtn) advBtn.addEventListener('click', doAdvanceWeek);
  const examBtn = document.getElementById('btn-start-exam');
  if (examBtn) examBtn.addEventListener('click', () => openExamModal(exam));
}

function journalEntryHtml(entry){
  return `<div class="journal-entry">
    <div class="journal-entry__meta">An ${entry.year} · Sem. ${entry.week}</div>
    <div class="journal-entry__text">${escapeHtml(entry.text)}</div>
  </div>`;
}

/* ---------- AVANCER LA SEMAINE ---------- */
function doAdvanceWeek(){
  const result = Game.advanceWeek();
  renderHeader();

  (result.unlockedAchievements || []).forEach(ach => {
    toast(`Objectif débloqué : ${ach.name}`, 'good', 'achievement');
  });

  if (result.weeklyEvent){
    openEventModal(result.weeklyEvent);
  } else {
    renderCurrentView();
    if (result.yearEnded){
      toast(`Nouvelle année scolaire : Année ${Game.state.time.year} !`, 'good');
    } else {
      toast('Une nouvelle semaine commence.', 'good');
    }
  }
}

function openEventModal(payload){
  const { event, npc } = payload;
  openModal({
    eyebrow: 'Événement de la semaine',
    title: event.title,
    bodyHtml: `<p>${escapeHtml(event.text(Game.state, npc))}</p>`,
    choices: event.choices.map(c => ({
      label: c.label, sub: c.sub,
      onClick(){
        const resultText = c.apply(Game.state, npc);
        SaveManager.save(Game.state);
        renderHeader();
        openModal({
          eyebrow: event.title,
          title: 'Résultat',
          bodyHtml: `<p>${escapeHtml(resultText)}</p>`,
          closeLabel: 'Continuer'
        });
        renderCurrentView();
      }
    }))
  });
}

/* ---------- MODALE D'EXAMEN ---------- */
function openExamModal(exam){
  openModal({
    eyebrow: 'Examen en cours — ' + exam.type,
    title: exam.icon + ' ' + exam.name,
    bodyHtml: `<p>${escapeHtml(exam.desc)}</p><p class="text-faint mono" style="margin-top:.6rem;">Difficulté estimée : ${exam.difficulty}</p>`,
    choices: exam.strategies.map(strat => ({
      label: strat.name,
      sub: strat.sub + (strat.cost ? ` (coût : ${strat.cost} pts)` : ''),
      onClick(){
        if (strat.cost && Game.state.player.points < strat.cost){
          toast('Pas assez de points pour cette stratégie.', 'bad');
          return;
        }
        if (strat.needsAlly){
          const hasAlly = Object.values(Game.state.player.relationships).some(r => r.type === 'allié');
          if (!hasAlly){ toast('Cette stratégie nécessite au moins un allié.', 'bad'); return; }
        }
        const result = resolveExamStrategy(Game.state, exam, strat);
        const outcome = applyExamOutcome(Game.state, exam, strat, result);
        // l'examen de la semaine est désormais passé : on le retire de la programmation
        Game.state.scheduledExams = Game.state.scheduledExams.filter(
          e => !(e.examId === exam.id && e.week === Game.state.time.week)
        );
        const newlyUnlocked = checkAchievements(Game.state);
        SaveManager.save(Game.state);
        renderHeader();
        newlyUnlocked.forEach(ach => toast(`Objectif débloqué : ${ach.name}`, 'good', 'achievement'));

        const tierClass = result.tier === 'echec' ? 'bad' : (result.tier === 'critique' || result.tier === 'reussite' ? 'good' : '');
        openModal({
          eyebrow: exam.name,
          title: outcome.tierData.label,
          bodyHtml: `
            <p>Stratégie choisie : <strong>${escapeHtml(strat.name)}</strong></p>
            <p class="mt-1">Score obtenu : <span class="mono text-gold">${result.score}</span> / difficulté ${exam.difficulty}</p>
          `,
          resultHtml: `<span>${escapeHtml(`Points personnels : ${outcome.pointsDelta>=0?'+':''}${outcome.pointsDelta}.${outcome.extraText||''}`)}</span>`,
          closeLabel: 'Terminer'
        });
        document.getElementById('modal-root').querySelector('.modal-result')?.classList.add(tierClass);
        renderCurrentView();
      }
    }))
  });
}

/* ---------- VUE : STATISTIQUES ---------- */
function renderStatsView(){
  const s = Game.state;
  const el = document.getElementById('view-stats');
  const spec = SPECIALTIES.find(sp => sp.id === s.player.specialtyId);
  el.innerHTML = `
    <h2 class="section-title">Statistiques du dossier</h2>
    <div class="panel">
      <div class="panel__title">Aptitudes <small>Spécialité : ${spec.name}</small></div>
      <div id="stat-lines"></div>
    </div>
    <div class="panel">
      <div class="panel__title">Profil stratégique <small>Votre style de jeu émerge de vos choix</small></div>
      <div id="style-lines"></div>
    </div>
    <div class="panel">
      <div class="panel__title">Historique d'examens</div>
      <div id="exam-history"></div>
    </div>
  `;
  const dominant = getDominantStyle(s);
  const styleWrap = document.getElementById('style-lines');
  const maxVal = Math.max(1, ...STYLE_KEYS.map(k => s.player.playstyle[k] || 0));
  styleWrap.innerHTML = (dominant ? `<p class="text-dim" style="margin-bottom:.6rem"><strong>Tendance dominante : ${dominant.label}.</strong> ${STYLE_DESC[dominant.key]}</p>` : `<p class="text-dim" style="margin-bottom:.6rem">Votre style de jeu n'est pas encore affirmé — vos choix futurs le détermineront.</p>`) +
    STYLE_KEYS.map(k => {
      const v = s.player.playstyle[k] || 0;
      const pct = Math.round((Math.max(0,v)/maxVal)*100);
      return statLineHtml(STYLE_LABELS[k], v, pct, STYLE_DESC[k]);
    }).join('');
  const lines = document.getElementById('stat-lines');
  lines.innerHTML = STAT_KEYS.map(k => statLineHtml(STAT_LABELS[k], s.player.stats[k], s.player.stats[k], STAT_DESC[k])).join('');

  const hist = document.getElementById('exam-history');
  if (!s.player.examHistory.length){
    hist.innerHTML = `<div class="empty-state">Aucun examen passé pour l'instant.</div>`;
  } else {
    hist.innerHTML = s.player.examHistory.slice().reverse().map(h => {
      const exam = EXAM_LIBRARY.find(e => e.id === h.examId);
      return `<div class="event-card">
        <div class="event-card__title">${exam ? exam.icon+' '+exam.name : h.examId} <span class="event-card__tag">${h.tier}</span></div>
        <div class="event-card__desc">Année ${h.year}, semaine ${h.week}</div>
      </div>`;
    }).join('');
  }
}

/* ---------- VUE : RELATIONS ---------- */
let relationsSortMode = 'affinity_desc';
const RELATIONS_SORTERS = {
  affinity_desc: { label:'Affinité (élevée → faible)', fn:(a,b)=>b.rel.affinity-a.rel.affinity },
  affinity_asc:  { label:'Affinité (faible → élevée)', fn:(a,b)=>a.rel.affinity-b.rel.affinity },
  trust_desc:    { label:'Confiance (élevée → faible)', fn:(a,b)=>b.rel.trust-a.rel.trust },
  alpha:         { label:'Ordre alphabétique', fn:(a,b)=>a.npc.fullName.localeCompare(b.npc.fullName) }
};

function renderRelationsView(){
  const s = Game.state;
  const el = document.getElementById('view-relations');
  const relEntries = Object.entries(s.player.relationships)
    .map(([npcId, rel]) => ({ npc: getNpc(s, npcId), rel }))
    .filter(e => e.npc)
    .sort(RELATIONS_SORTERS[relationsSortMode].fn);

  el.innerHTML = `
    <h2 class="section-title">Réseau relationnel</h2>
    <div class="panel">
      <div class="panel__title">Vos liens <small>${relEntries.length} contact(s)</small></div>
      ${relEntries.length ? `<div class="toolbar">
        <span class="toolbar__label">Trier par</span>
        <select class="toolbar__select" id="rel-sort">
          ${Object.entries(RELATIONS_SORTERS).map(([id,o]) => `<option value="${id}" ${id===relationsSortMode?'selected':''}>${o.label}</option>`).join('')}
        </select>
      </div>` : ''}
      <div id="rel-list" class="grid-cards"></div>
    </div>
  `;
  const sortSel = document.getElementById('rel-sort');
  if (sortSel) sortSel.addEventListener('change', () => { relationsSortMode = sortSel.value; renderRelationsView(); });

  const list = document.getElementById('rel-list');
  if (!relEntries.length){
    list.innerHTML = `<div class="empty-state">Vous n'avez encore établi aucun lien notable.</div>`;
    return;
  }
  list.innerHTML = relEntries.map(({npc, rel}) => `
    <div class="npc-card" data-npc="${npc.id}">
      <div class="npc-card__top">
        <div class="npc-card__avatar">${npc.avatar}</div>
        <div>
          <div class="npc-card__name">${npc.fullName}</div>
          <div class="npc-card__class" style="color:${CLASS_COLOR[npc.classId]}">Classe ${npc.classId}</div>
        </div>
      </div>
      <div class="npc-card__trait">${rel.type}${s.player.knownSecrets.includes(npc.id) ? ' · 🔓 secret connu' : ''}</div>
      <div class="npc-card__bond">
        <div class="bond-bar"><div class="bond-bar__fill" style="width:${clamp(rel.affinity+100,0,200)/2}%; background:${relColor(rel.type)}"></div></div>
      </div>
    </div>`).join('');

  list.querySelectorAll('.npc-card').forEach(card => {
    card.addEventListener('click', () => openNpcModal(card.dataset.npc));
  });
}

/** Modale de détail / interaction pour un PNJ donné, accessible depuis Relations / Classe / École. */
function openNpcModal(npcId){
  const s = Game.state;
  const npc = getNpc(s, npcId);
  if (!npc) return;
  const rel = getRel(s, npcId);
  const knowsSecret = s.player.knownSecrets.includes(npcId);

  const memoryHtml = (npc.memory && npc.memory.length)
    ? `<p class="mt-1"><strong>Ce qu'il/elle se souvient de vous :</strong></p>` + npc.memory.slice(0,3).map(m =>
        `<div class="npc-memory">An ${m.year} · Sem. ${m.week} — ${escapeHtml(m.text)}</div>`).join('')
    : '';

  const bodyHtml = `
    <div class="flex-between"><span class="tag">Classe ${npc.classId}</span><span class="tag">${npc.archetypeLabel}</span></div>
    <p class="mt-1"><strong>Traits :</strong> ${npc.traits.join(', ')}</p>
    <p><strong>Ambition :</strong> ${escapeHtml(npc.ambition)}</p>
    <p><strong>Relation :</strong> <span style="color:${relColor(rel.type)}">${rel.type}</span> (affinité ${rel.affinity}, confiance ${rel.trust}, peur ${rel.fear})</p>
    <p><strong>Secret :</strong> ${knowsSecret ? escapeHtml(npc.secret.text) : 'Inconnu — enquêtez pour le découvrir.'}</p>
    ${memoryHtml}
  `;

  const choices = [
    { label:'Passer du temps ensemble', sub:'+affinité, +confiance', onClick(){
        adjustRelation(s, npcId, { affinity: rndInt(4,9), trust: rndInt(2,5) });
        finishNpcAction(npcId, `Vous passez un bon moment avec ${npc.fullName}.`);
      }},
    { label:'Enquêter sur son secret', sub:'Dépend de l\'influence et de la chance', onClick(){
        const success = investigateSecret(s, npcId);
        finishNpcAction(npcId, success ? `Vous découvrez quelque chose sur ${npc.fullName}.` : `Votre enquête sur ${npc.fullName} échoue.`);
      }},
    { label:'Proposer une alliance', sub:'Nécessite une affinité suffisante', onClick(){
        const success = formAlliance(s, npcId);
        finishNpcAction(npcId, success ? `Alliance formée avec ${npc.fullName} !` : `${npc.fullName} refuse votre alliance.`);
      }},
    { label:'Corrompre (200 pts)', sub:'Achète un service ou une faveur', onClick(){
        const res = bribeNpc(s, npcId, 200);
        finishNpcAction(npcId, res.success ? `${npc.fullName} accepte votre offre.` : `${npc.fullName} refuse et se méfie.`);
      }}
  ];
  if (!knowsSecret){
    choices.push({ label:'Acheter un renseignement garanti (300 pts)', sub:'Aucun hasard : révèle directement son secret', onClick(){
      if (s.player.points < 300){ toast('Pas assez de points.', 'bad'); return; }
      s.player.points -= 300;
      s.player.knownSecrets.push(npcId);
      s.stats_meta.secretsDiscovered++;
      bumpStyle(s, 'discret', 1);
      addJournalEntry(s, `Vous achetez un renseignement garanti sur ${npc.fullName}.`, 'secret');
      finishNpcAction(npcId, `Un contact fiable vous livre le secret de ${npc.fullName} sans détour.`);
    }});
  }
  if (rel.type === 'allié'){
    choices.push({ label:'Trahir cet allié (+250 pts)', sub:'Gain immédiat, confiance brisée durablement', onClick(){
      confirmAction({
        eyebrow: 'Trahison',
        title: `Trahir ${npc.fullName} ?`,
        text: `${npc.fullName} vous fait confiance. Cette trahison rapportera des points immédiats mais brisera durablement le lien, et il/elle s'en souviendra.`,
        confirmLabel: 'Trahir pour 250 pts',
        danger: true,
        onConfirm(){
          betrayAlly(s, npcId, 250);
          finishNpcAction(npcId, `Vous avez trahi ${npc.fullName}.`);
        }
      });
    }});
  }

  openModal({ eyebrow: 'Dossier élève', title: npc.fullName, bodyHtml, choices });
}

function finishNpcAction(npcId, text){
  SaveManager.save(Game.state);
  renderHeader();
  openModal({ eyebrow:'Action effectuée', title:'Résultat', bodyHtml:`<p>${escapeHtml(text)}</p>`, closeLabel:'Continuer' });
  renderCurrentView();
}

/* ---------- VUE : MA CLASSE ---------- */
function renderClassroomView(){
  const s = Game.state;
  const el = document.getElementById('view-classroom');
  const classmates = s.npcs.filter(n => n.classId === s.player.classId && n.status === 'actif');
  el.innerHTML = `
    <h2 class="section-title">Classe ${s.time.year}-${s.player.classId}</h2>
    <p class="text-dim">${CLASS_LABEL[s.player.classId]} — ${classmates.length} camarades de classe.</p>
    <div class="grid-cards mt-2" id="classroom-list"></div>
  `;
  const list = document.getElementById('classroom-list');
  list.innerHTML = classmates.map(n => npcCardHtml(s, n)).join('');
  list.querySelectorAll('.npc-card').forEach(card => card.addEventListener('click', () => openNpcModal(card.dataset.npc)));
}

function npcCardHtml(s, n){
  const rel = getRel(s, n.id);
  const knowsSecret = s.player.knownSecrets.includes(n.id);
  return `
    <div class="npc-card" data-npc="${n.id}">
      <div class="npc-card__badges">
        ${n.allianceId ? '<span class="badge-dot" title="En alliance" style="background:#c9a227"></span>' : ''}
        ${knowsSecret ? '<span class="badge-dot" title="Secret connu" style="background:#b23a3a"></span>' : ''}
      </div>
      <div class="npc-card__top">
        <div class="npc-card__avatar">${n.avatar}</div>
        <div>
          <div class="npc-card__name">${n.fullName}</div>
          <div class="npc-card__class" style="color:${CLASS_COLOR[n.classId]}">${n.archetypeLabel}</div>
        </div>
      </div>
      <div class="npc-card__trait">${n.traits.join(' · ')}</div>
      <div class="npc-card__bond">
        <div class="bond-bar"><div class="bond-bar__fill" style="width:${clamp(rel.affinity+100,0,200)/2}%; background:${relColor(rel.type)}"></div></div>
      </div>
    </div>`;
}

/* ---------- VUE : ÉCOLE (carte) ---------- */
const SCHOOL_LOCATIONS = [
  { id:'library', ic:'📚', name:'Bibliothèque', desc:'Étudier en profondeur', action(state){
      state.player.stats.intelligence = clamp(state.player.stats.intelligence + 2, 0, 100);
      return "Vous passez du temps à la bibliothèque. Intelligence +2.";
    }},
  { id:'gym', ic:'🏋️', name:'Gymnase', desc:'S\'entraîner physiquement', action(state){
      state.player.stats.force = clamp(state.player.stats.force + 1, 0, 100);
      state.player.stats.endurance = clamp(state.player.stats.endurance + 1, 0, 100);
      return "Séance d'entraînement complète. Force +1, Endurance +1.";
    }},
  { id:'cafeteria', ic:'🍜', name:'Cafétéria', desc:'Socialiser autour d\'un repas', action(state){
      state.player.stats.charisme = clamp(state.player.stats.charisme + 1, 0, 100);
      state.player.stats.popularite = clamp(state.player.stats.popularite + 1, 0, 100);
      return "Un repas convivial améliore votre image. Charisme +1, Popularité +1.";
    }},
  { id:'dorms', ic:'🏠', name:'Dortoirs', desc:'Se reposer et réfléchir', action(state){
      state.player.stats.sangFroid = clamp(state.player.stats.sangFroid + 2, 0, 100);
      return "Vous vous reposez au calme. Sang-froid +2.";
    }},
  { id:'shop', ic:'🛍️', name:'Kiosque de l\'école', desc:'Ouvrir la boutique', action(){ return null; } },
  { id:'rooftop', ic:'🌇', name:'Toit', desc:'Discussion privée, loin des regards', action(state){
      state.player.stats.influence = clamp(state.player.stats.influence + 1, 0, 100);
      return "Une conversation discrète sur le toit vous ouvre des perspectives. Influence +1.";
    }},
  { id:'admin', ic:'🏛️', name:'Bureau administratif', desc:'Consulter les règlements et classements', action(){ return "Vous consultez les archives administratives. Rien de neuf pour l'instant."; } },
  { id:'staffroom', ic:'🧑‍🏫', name:'Salle des professeurs', desc:'Tenter d\'obtenir des informations privilégiées', action(state){
      const chance = clamp(0.2 + state.player.stats.reputation/220, 0.05, 0.7);
      if (Math.random() < chance){
        state.player.stats.reputation = clamp(state.player.stats.reputation+1,0,100);
        return "Un professeur vous laisse échapper une information utile. Réputation +1.";
      }
      return "Les enseignants restent muets face à vos questions.";
    }},
  { id:'clubroom', ic:'🎯', name:'Salle des clubs', desc:'Participer à une activité de club', action(state){
      state.player.stats.reputation = clamp(state.player.stats.reputation + 1, 0, 100);
      state.player.stats.popularite = clamp(state.player.stats.popularite + 1, 0, 100);
      return "Votre implication dans le club est remarquée. Réputation +1, Popularité +1.";
    }},
  { id:'courtyard', ic:'🌳', name:'Cour intérieure', desc:'Observer la vie sociale de l\'école', action(state){
      const chance = clamp(0.25 + state.player.stats.chance/220, 0.1, 0.6);
      if (Math.random() < chance){
        state.player.stats.chance = clamp(state.player.stats.chance + 1, 0, 100);
        return "En observant discrètement, vous saisissez une opportunité inattendue. Chance +1.";
      }
      return "Une pause tranquille dans la cour, sans événement notable.";
    }},
  { id:'infirmary', ic:'⛑️', name:'Infirmerie', desc:'Se faire soigner et discuter avec l\'infirmier(ère)', action(state){
      state.player.stats.endurance = clamp(state.player.stats.endurance + 2, 0, 100);
      return "Un passage à l'infirmerie vous remet sur pied. Endurance +2.";
    }}
];

function renderSchoolView(){
  const el = document.getElementById('view-school');
  el.innerHTML = `
    <h2 class="section-title">Carte de l'école</h2>
    <p class="text-dim">Choisissez un lieu à visiter cette semaine.</p>
    <div class="school-map mt-2" id="school-map"></div>
  `;
  const map = document.getElementById('school-map');
  map.innerHTML = SCHOOL_LOCATIONS.map(loc => `
    <div class="school-loc" data-loc="${loc.id}">
      <div class="school-loc__ic">${loc.ic}</div>
      <div class="school-loc__name">${loc.name}</div>
      <div class="school-loc__desc">${loc.desc}</div>
    </div>`).join('');
  map.querySelectorAll('.school-loc').forEach(card => {
    card.addEventListener('click', () => {
      const loc = SCHOOL_LOCATIONS.find(l => l.id === card.dataset.loc);
      if (loc.id === 'shop'){ currentView = 'inventory'; document.querySelectorAll('.navbtn[data-view]').forEach(b=>b.classList.toggle('active', b.dataset.view==='inventory')); renderCurrentView(); return; }
      const text = loc.action(Game.state);
      SaveManager.save(Game.state);
      renderHeader();
      if (text) openModal({ eyebrow: loc.name, title:'Résultat', bodyHtml:`<p>${escapeHtml(text)}</p>`, closeLabel:'Continuer' });
    });
  });
}

/* ---------- VUE : INVENTAIRE / BOUTIQUE ---------- */
function renderInventoryView(){
  const s = Game.state;
  const el = document.getElementById('view-inventory');
  el.innerHTML = `
    <h2 class="section-title">Boutique & Inventaire</h2>
    <p class="text-dim">Points disponibles : <span class="mono text-gold">${s.player.points.toLocaleString('fr-FR')}</span></p>
    <div class="grid-cards mt-2" id="shop-list"></div>
  `;
  const list = document.getElementById('shop-list');
  list.innerHTML = SHOP_ITEMS.map(item => {
    const isStocked = item.stock != null;
    const remaining = isStocked ? (s.shopStock[item.id] ?? item.stock) : null;
    const outOfStock = isStocked && remaining <= 0;
    const disabled = s.player.points < item.price || outOfStock;
    return `
    <div class="item-card${isStocked ? ' item-card--rare' : ''}">
      <div class="item-card__head"><span class="item-card__name">${item.name}</span><span class="item-card__price">${item.price} pts</span></div>
      <div class="item-card__desc">${item.desc}${isStocked ? ` <strong>(${outOfStock ? 'épuisé' : remaining + ' restant(s)'})</strong>` : ''}</div>
      <button class="btn btn--small btn--primary" data-item="${item.id}" ${disabled ? 'disabled' : ''}>${outOfStock ? 'Épuisé' : 'Acheter'}</button>
    </div>`;
  }).join('');
  list.querySelectorAll('button[data-item]').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = SHOP_ITEMS.find(i => i.id === btn.dataset.item);
      if (s.player.points < item.price) return;
      if (item.stock != null){
        const remaining = s.shopStock[item.id] ?? item.stock;
        if (remaining <= 0) return;
        s.shopStock[item.id] = remaining - 1;
      }
      s.player.points -= item.price;
      item.apply(s);
      addJournalEntry(s, `Achat : ${item.name}.`, 'shop');
      SaveManager.save(s);
      renderHeader();
      renderCurrentView();
      toast(`${item.name} acquis.`, 'good');
    });
  });
}

/* ---------- VUE : PLANNING ---------- */
function renderPlanningView(){
  const s = Game.state;
  const el = document.getElementById('view-planning');
  el.innerHTML = `
    <h2 class="section-title">Planning hebdomadaire</h2>
    <p class="text-dim">Définissez votre activité pour chaque jour, puis avancez la semaine depuis le tableau de bord.</p>
    <div class="panel mt-2" id="plan-list"></div>
  `;
  const list = document.getElementById('plan-list');
  list.innerHTML = WEEKDAYS.map(day => `
    <div class="plan-day">
      <span class="plan-day__name">${day}</span>
      <select class="plan-slot-select" data-day="${day}">
        ${Object.entries(ACTIVITIES).map(([id,act]) => `<option value="${id}" ${s.planning[day]===id?'selected':''}>${act.ic} ${act.label}</option>`).join('')}
      </select>
    </div>`).join('');
  list.querySelectorAll('.plan-slot-select').forEach(sel => {
    sel.addEventListener('change', () => {
      s.planning[sel.dataset.day] = sel.value;
      SaveManager.save(s);
    });
  });

  const legend = document.createElement('div');
  legend.className = 'panel';
  legend.innerHTML = `<div class="panel__title">Effets des activités</div>` +
    Object.values(ACTIVITIES).map(a => `<div class="action-item"><div><div class="action-item__label">${a.ic} ${a.label}</div><div class="action-item__hint">${a.desc}</div></div></div>`).join('');
  el.appendChild(legend);
}

/* ---------- VUE : CLASSEMENT ---------- */
let studentRankClassFilter = null;

function renderRankingView(){
  const s = Game.state;
  if (!studentRankClassFilter) studentRankClassFilter = s.player.classId;
  const el = document.getElementById('view-ranking');
  const ranking = CLASS_IDS.slice().sort((a,b) => s.classPoints[b] - s.classPoints[a]);
  el.innerHTML = `
    <h2 class="section-title">Classement des classes</h2>
    <div class="panel" id="rank-list"></div>

    <div class="panel">
      <div class="panel__title">Classement des élèves <small>Popularité au sein d'une classe</small></div>
      <div class="toolbar">
        <span class="toolbar__label">Classe</span>
        <select class="toolbar__select" id="rank-class-select">
          ${CLASS_IDS.map(cid => `<option value="${cid}" ${cid===studentRankClassFilter?'selected':''}>Classe ${cid}${cid===s.player.classId?' (la vôtre)':''}</option>`).join('')}
        </select>
      </div>
      <div id="rank-students"></div>
    </div>

    <div class="panel">
      <div class="panel__title">Classement social <small>Toutes classes confondues</small></div>
      <div id="rank-social"></div>
    </div>
  `;
  const list = document.getElementById('rank-list');
  list.innerHTML = ranking.map((cid, i) => `
    <div class="rank-row ${cid===s.player.classId?'you':''}">
      <div class="rank-row__pos${i<3?` medal medal--${i+1}`:''}">${i<3 ? ['🥇','🥈','🥉'][i] : i+1}</div>
      <div>
        <div class="rank-row__name" style="color:${CLASS_COLOR[cid]}">Classe ${s.time.year}-${cid} ${cid===s.player.classId?'(vous)':''}</div>
        <div class="text-faint" style="font-size:.72rem">${CLASS_LABEL[cid]}</div>
      </div>
      <div class="rank-row__points">${s.classPoints[cid].toLocaleString('fr-FR')} pts</div>
    </div>`).join('');

  const classSel = document.getElementById('rank-class-select');
  classSel.addEventListener('change', () => { studentRankClassFilter = classSel.value; renderRankingView(); });

  const studentsWrap = document.getElementById('rank-students');
  const classStudents = s.npcs
    .filter(n => n.classId === studentRankClassFilter && n.status === 'actif')
    .map(n => ({ id:n.id, name:n.fullName, pop:n.stats.popularite, isPlayer:false }));
  if (studentRankClassFilter === s.player.classId){
    classStudents.push({ id:'player', name:`${s.player.name} (vous)`, pop:s.player.stats.popularite, isPlayer:true });
  }
  classStudents.sort((a,b) => b.pop - a.pop);
  studentsWrap.innerHTML = classStudents.length ? classStudents.map((c,i) => `
    <div class="rank-row${c.isPlayer?' you':''}${c.isPlayer?'':' rank-row--clickable'}" ${c.isPlayer?'':`data-npc="${c.id}"`}>
      <div class="rank-row__pos${i<3?` medal medal--${i+1}`:''}">${i<3 ? ['🥇','🥈','🥉'][i] : i+1}</div>
      <div><div class="rank-row__name">${escapeHtml(c.name)}</div></div>
      <div class="rank-row__points">${c.pop} pop.</div>
    </div>`).join('') : `<div class="empty-state">Aucun élève actif dans cette classe pour l'instant.</div>`;
  studentsWrap.querySelectorAll('.rank-row[data-npc]').forEach(row => {
    row.addEventListener('click', () => openNpcModal(row.dataset.npc));
  });

  const socialTop = s.npcs.filter(n=>n.status==='actif').slice().sort((a,b)=>b.stats.popularite - a.stats.popularite).slice(0,8);
  const social = document.getElementById('rank-social');
  social.innerHTML = socialTop.map((n,i) => `
    <div class="rank-row rank-row--clickable" data-npc="${n.id}">
      <div class="rank-row__pos${i<3?` medal medal--${i+1}`:''}">${i<3 ? ['🥇','🥈','🥉'][i] : i+1}</div>
      <div><div class="rank-row__name">${n.fullName}</div><div class="text-faint" style="font-size:.72rem">Classe ${n.classId}</div></div>
      <div class="rank-row__points">${n.stats.popularite} pop.</div>
    </div>`).join('');
  social.querySelectorAll('.rank-row[data-npc]').forEach(row => {
    row.addEventListener('click', () => openNpcModal(row.dataset.npc));
  });
}

const JOURNAL_TYPE_LABELS = {
  majeur:'Événements majeurs', secret:'Secrets', objectif:'Objectifs', betrayal:'Trahisons',
  corruption:'Corruption', exam:'Examens', relation:'Relations', shop:'Boutique', system:'Administration'
};
let journalFilter = 'all';

function renderJournalView(){
  const s = Game.state;
  const el = document.getElementById('view-journal');
  const types = Array.from(new Set(s.player.journal.map(e => e.type).filter(Boolean)));
  el.innerHTML = `
    <h2 class="section-title">Journal de bord</h2>
    ${types.length ? `<div class="toolbar">
      <span class="toolbar__label">Filtrer</span>
      <select class="toolbar__select" id="journal-filter">
        <option value="all" ${journalFilter==='all'?'selected':''}>Tout afficher</option>
        ${types.map(t => `<option value="${t}" ${journalFilter===t?'selected':''}>${JOURNAL_TYPE_LABELS[t] || t}</option>`).join('')}
      </select>
    </div>` : ''}
    <div class="panel" id="journal-full"></div>
  `;
  const filterSel = document.getElementById('journal-filter');
  if (filterSel) filterSel.addEventListener('change', () => { journalFilter = filterSel.value; renderJournalView(); });

  const wrap = document.getElementById('journal-full');
  const entries = journalFilter === 'all' ? s.player.journal : s.player.journal.filter(e => e.type === journalFilter);
  wrap.innerHTML = entries.length
    ? entries.map(journalEntryHtml).join('')
    : `<div class="empty-state">${journalFilter==='all' ? 'Votre journal est vide pour l\'instant.' : 'Aucune entrée de ce type pour l\'instant.'}</div>`;
}

/* ================================================================
   12. INITIALISATION & LISTENERS GLOBAUX
   ================================================================ */

function wireNav(){
  document.querySelectorAll('.navbtn[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      SFX.play('nav');
      currentView = btn.dataset.view;
      document.querySelectorAll('.navbtn[data-view]').forEach(b => b.classList.toggle('active', b===btn));
      renderCurrentView();
      if (currentView === 'journal' && Game.state){
        Game.state.player.lastJournalSeenCount = Game.state.player.journal.length;
        SaveManager.save(Game.state);
        renderNavBadge();
      }
      document.getElementById('app-nav').classList.remove('open');
    });
  });
  document.getElementById('btn-menu-return').addEventListener('click', () => {
    SaveManager.save(Game.state);
    showScreen('screen-menu');
    refreshMenuButtons();
  });
  document.getElementById('app-nav-toggle').addEventListener('click', () => {
    document.getElementById('app-nav').classList.toggle('open');
  });
  const backdrop = document.getElementById('app-nav-backdrop');
  if (backdrop){
    backdrop.addEventListener('click', () => {
      document.getElementById('app-nav').classList.remove('open');
    });
  }
}

function wireMenu(){
  document.getElementById('btn-new-game').addEventListener('click', () => {
    // reset de l'état de création
    createState.name = ''; createState.gender = 'X'; createState.avatar = AVATARS[0];
    createState.specialtyId = null; STAT_KEYS.forEach(k => createState.allocation[k] = 0);
    showScreen('screen-create');
    renderCreateScreen();
  });
  document.getElementById('btn-continue').addEventListener('click', () => {
    const saved = SaveManager.load();
    if (!saved){ toast('Aucune sauvegarde trouvée.', 'bad'); return; }
    Game.init(saved);
    enterApp();
  });
  document.getElementById('btn-reset').addEventListener('click', () => {
    confirmAction({
      eyebrow: 'Sauvegarde',
      title: 'Effacer votre dossier ?',
      text: 'Toute votre progression — relations, secrets, réputation, historique — sera définitivement perdue.',
      confirmLabel: 'Effacer définitivement',
      danger: true,
      onConfirm(){
        SaveManager.clear();
        refreshMenuButtons();
        toast('Sauvegarde effacée.', 'bad');
      }
    });
  });
}

function wireCreate(){
  document.getElementById('btn-back-menu').addEventListener('click', () => { showScreen('screen-menu'); refreshMenuButtons(); });
  document.getElementById('btn-confirm-create').addEventListener('click', tryConfirmCreate);
  document.getElementById('input-name').addEventListener('input', (e) => { createState.name = e.target.value; });
}

document.addEventListener('DOMContentLoaded', () => {
  Settings.load();
  const muteBtn = document.getElementById('hdr-mute');
  if (muteBtn){
    muteBtn.textContent = Settings.data.muted ? '🔇' : '🔊';
    muteBtn.addEventListener('click', () => {
      const muted = Settings.toggleMute();
      muteBtn.textContent = muted ? '🔇' : '🔊';
      if (!muted) SFX.play('click');
    });
  }
  wireNav();
  wireMenu();
  wireCreate();
  bootSequence();

  // autosave périodique de sécurité (en plus des sauvegardes déclenchées par action)
  setInterval(() => { if (Game.state) SaveManager.save(Game.state); }, 20000);
});
