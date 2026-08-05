/* ================================================================
   COTN — LAS NOCHES HIGH SCHOOL
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

/* ---------------------------------------------------------------
   Clubs — appartenance persistante, choisie dans la vue « École ».
   Rejoindre un club octroie un bonus passif lors de l'activité
   « Activité de club » et ouvre l'accès à des événements dédiés
   (tournois, expositions...).
   --------------------------------------------------------------- */
const CLUBS = [
  { id:'sport', name:'Club sportif', ic:'🏅', tag:'Dépassement physique et esprit d\'équipe', bonus:{force:1, endurance:1} },
  { id:'science', name:'Club scientifique', ic:'🔬', tag:'Rigueur, méthode, curiosité', bonus:{intelligence:1, sangFroid:1} },
  { id:'art', name:'Club artistique', ic:'🎭', tag:'Expression, charisme, image publique', bonus:{charisme:1, popularite:1} },
  { id:'strategy', name:'Club de jeux de stratégie', ic:'♟️', tag:'Anticipation et calcul froid', bonus:{intelligence:1, influence:1} },
  { id:'news', name:'Journal de l\'école', ic:'📰', tag:'Accès privilégié aux rumeurs et informations', bonus:{influence:1, chance:1} },
  { id:'debate', name:'Club de débat', ic:'🗣️', tag:'Rhétorique, persuasion, joute verbale', bonus:{charisme:1, sangFroid:1} }
];

function getClub(clubId){ return CLUBS.find(c => c.id === clubId) || null; }

/** Rejoint (ou change de) club. Le premier engagement est gratuit ; changer ensuite coûte des points. */
function joinClub(state, clubId){
  const club = getClub(clubId);
  if (!club) return { success:false };
  const alreadyHad = !!state.player.clubId;
  const switchCost = 60;
  if (alreadyHad && state.player.clubId !== clubId){
    if (state.player.points < switchCost) return { success:false, reason:'points' };
    state.player.points -= switchCost;
  }
  state.player.clubId = clubId;
  addJournalEntry(state, `Vous rejoignez le ${club.name}.`, 'system');
  return { success:true };
}

/* ---------------------------------------------------------------
   Professeurs — figures d'autorité avec lesquelles le joueur peut
   entrer en conflit ouvert. Chaque professeur a un dossier
   d'enquête progressif (0 à 3 preuves), alimenté depuis la vue
   « École ». Une fois le dossier complet, une confrontation finale
   peut aboutir à son renvoi, à son discrédit, ou à l'échec (et la
   sanction) du joueur.
   --------------------------------------------------------------- */
const TEACHERS = [
  { id:'t_mercier', name:'M. Mercier', subject:'Mathématiques', ic:'📐', trait:'Rigide et rancunier', autorite:70, vigilance:55, integrite:60 },
  { id:'t_dubreuil', name:'Mme Dubreuil', subject:'Littérature', ic:'📖', trait:'Favoritisme assumé', autorite:55, vigilance:40, integrite:35 },
  { id:'t_khadir', name:'M. Khadir', subject:'Sciences', ic:'🧪', trait:'Perfectionniste, aucune tolérance', autorite:65, vigilance:70, integrite:75 },
  { id:'t_lenoir', name:'Mme Lenoir', subject:'Sport', ic:'🏃', trait:'Autoritaire, aime humilier les faibles', autorite:75, vigilance:45, integrite:50 },
  { id:'t_aubert', name:'M. Aubert', subject:'Histoire', ic:'📜', trait:'Distant, secrets mal gardés', autorite:50, vigilance:35, integrite:30 },
  { id:'t_moreau', name:'Mme Moreau', subject:'Économie', ic:'📊', trait:'Calculatrice, obsédée par les résultats', autorite:60, vigilance:60, integrite:45 }
];

function getTeacher(teacherId){ return TEACHERS.find(t => t.id === teacherId) || null; }

const TEACHER_STATUS_LABELS = {
  actif: 'En poste',
  renvoye: 'Renvoyé(e)',
  discredite: 'Discrédité(e), toujours en poste',
  corrompu: 'Sous pression — vous a discrètement soutenu(e)',
  echec: 'Dossier brûlé — trop risqué pour l\'instant'
};

function getTeacherDossier(state, teacherId){
  if (!state.player.teacherDossiers) state.player.teacherDossiers = {};
  if (!state.player.teacherDossiers[teacherId]){
    state.player.teacherDossiers[teacherId] = { evidence: 0, status: 'actif' };
  }
  return state.player.teacherDossiers[teacherId];
}

/** Étape 1 — repérer une faiblesse exploitable chez un professeur. */
function investigateTeacher(state, teacherId){
  const teacher = getTeacher(teacherId);
  const dossier = getTeacherDossier(state, teacherId);
  if (dossier.status !== 'actif') return { success:false, text:`${teacher.name} n'est plus une cible pertinente pour l'instant.` };
  if (dossier.evidence >= 3) return { success:false, text:`Vous avez déjà de quoi confronter ${teacher.name}.` };
  const chance = clamp(0.28 + state.player.stats.influence/220 + state.player.stats.chance/260 - teacher.vigilance/300, 0.05, 0.85);
  if (Math.random() < chance){
    dossier.evidence = clamp(dossier.evidence + 1, 0, 3);
    bumpStyle(state, 'manipulateur', 2);
    return { success:true, text:`Vous découvrez un élément compromettant sur ${teacher.name}. Dossier : ${dossier.evidence}/3.` };
  }
  if (Math.random() < teacher.vigilance/220){
    state.player.stats.reputation = clamp(state.player.stats.reputation - rndInt(2,6), 0, 100);
    return { success:false, text:`${teacher.name} remarque votre curiosité suspecte. Réputation en baisse.` };
  }
  return { success:false, text:`Vous ne trouvez rien d'exploitable cette fois-ci.` };
}

/** Étape 2 — recouper les éléments trouvés pour solidifier le dossier (utile avec un allié). */
function buildTeacherCase(state, teacherId){
  const teacher = getTeacher(teacherId);
  const dossier = getTeacherDossier(state, teacherId);
  if (dossier.evidence < 1) return { success:false, text:`Vous n'avez encore rien à recouper sur ${teacher.name}.` };
  if (dossier.evidence >= 3) return { success:false, text:`Le dossier est déjà complet.` };
  const hasAlly = Object.values(state.player.relationships).some(r => r.type === 'allié');
  const chance = clamp(0.32 + state.player.stats.intelligence/240 + (hasAlly ? 0.15 : 0), 0.1, 0.9);
  if (Math.random() < chance){
    dossier.evidence = clamp(dossier.evidence + 1, 0, 3);
    return { success:true, text:`${hasAlly ? 'Avec l\'aide d\'un allié, vous recoupez' : 'Vous recoupez'} les témoignages. Dossier : ${dossier.evidence}/3.` };
  }
  return { success:false, text:`Les pistes ne mènent nulle part cette semaine.` };
}

/** Étape 3 — confrontation finale : le dossier complet est opposé à l'autorité du professeur. */
function confrontTeacher(state, teacherId){
  const teacher = getTeacher(teacherId);
  const dossier = getTeacherDossier(state, teacherId);
  if (dossier.evidence < 3) return { success:false, text:`Le dossier n'est pas encore assez solide (${dossier.evidence}/3).` };
  const power = dossier.evidence * 12 + state.player.stats.influence * 0.5 + state.player.stats.charisme * 0.3 + state.player.stats.reputation * 0.2;
  const resistance = teacher.autorite * 0.6 + teacher.integrite * 0.4;
  const margin = power - resistance;

  if (margin > 15){
    dossier.status = 'renvoye';
    state.player.stats.influence = clamp(state.player.stats.influence + 5, 0, 100);
    state.player.stats.popularite = clamp(state.player.stats.popularite + 8, 0, 100);
    state.stats_meta.teachersDefeated = (state.stats_meta.teachersDefeated || 0) + 1;
    bumpStyle(state, 'manipulateur', 6);
    addJournalEntry(state, `${teacher.name} est démis(e) de ses fonctions après la publication de votre dossier.`, 'majeur');
    return { success:true, text:`Le dossier fait mouche. L'administration n'a d'autre choix que de démettre ${teacher.name}. Toute l'école en parle.` };
  }
  if (margin > -10){
    dossier.status = 'discredite';
    state.player.stats.popularite = clamp(state.player.stats.popularite + 3, 0, 100);
    addJournalEntry(state, `${teacher.name} reste en poste mais son autorité est sérieusement ébranlée.`, 'majeur');
    return { success:true, text:`${teacher.name} s'en sort de justesse, mais son autorité ne s'en remettra pas complètement.` };
  }
  dossier.status = 'echec';
  dossier.evidence = 0;
  state.player.stats.reputation = clamp(state.player.stats.reputation - rndInt(10,20), 0, 100);
  addJournalEntry(state, `Votre tentative de discréditer ${teacher.name} se retourne contre vous. Convocation et avertissement.`, 'majeur');
  return { success:false, text:`${teacher.name} retourne l'accusation contre vous. Votre réputation est sérieusement entachée.` };
}

const CLASS_IDS = ['A', 'B', 'C', 'D'];
const CLASS_COLOR = { A: '#ffb347', B: '#4d96ff', C: '#ff6b81', D: '#a29bd1' };
const CLASS_LABEL = {
  A: 'Classe d\'élite — privilèges maximaux',
  B: 'Classe solide — bonne réputation',
  C: 'Classe moyenne — sous pression constante',
  D: 'Classe des rebuts — méprisée par l\'administration'
};

const SEASONS = ['Printemps', 'Été', 'Automne', 'Hiver'];
const WEEKS_PER_YEAR = 28;
const MAX_YEARS = 3;

/* ---------------------------------------------------------------
   Objectifs à durée limitée (quêtes narratives avec échéance).
   Seul l'état minimal (id, status, rivalNpcId) est persisté dans
   state.goals ; la définition (titre, condition, échéance) reste
   ici pour ne rien dupliquer dans la sauvegarde.
   --------------------------------------------------------------- */
const STORY_GOAL_DEFS = [
  {
    id: 'goal_classA',
    title: 'Devenez Classe A avant l\'année 3',
    desc: 'Si vous n\'intégrez pas la Classe A avant le début de la 3ᵉ année, un(e) élève ambitieux(se) y parviendra à votre place — et vous le fera savoir.',
    deadlineYear: 3,
    deadlineWeek: 1,
    checkSuccess(state){ return state.player.classId === 'A'; }
  }
];
function getGoalDef(id){ return STORY_GOAL_DEFS.find(g => g.id === id) || null; }

const WEEKDAYS = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];

const ACTIVITIES = {
  etudier:    { label: 'Étudier',            ic:'📖', stats:{intelligence:2},               desc:'Améliore l\'intelligence.' },
  entrainer:  { label: 'Entraînement physique', ic:'🏋️', stats:{force:2, endurance:1},       desc:'Améliore la force et l\'endurance.' },
  socialiser: { label: 'Socialiser',          ic:'💬', stats:{charisme:1, popularite:2},     desc:'Améliore le charisme et la popularité, renforce vos liens.' },
  espionner:  { label: 'Espionner',           ic:'🕵️', stats:{influence:1, chance:1},        desc:'Récolte des informations et des secrets sur d\'autres élèves.' },
  travailler: { label: 'Petit boulot',        ic:'💰', stats:{}, points: 120,                desc:'Rapporte des points personnels.' },
  reposer:    { label: 'Se reposer',          ic:'🛌', stats:{sangFroid:2, endurance:1},     desc:'Récupère le sang-froid, réduit le stress.' },
  club:       { label: 'Activité de club',    ic:'🎯', stats:{reputation:1, popularite:1},  desc:'Améliore votre image et votre réseau.' },
  mediter:    { label: 'Méditation',          ic:'🧘', stats:{sangFroid:2, chance:1},        desc:'Clarifie l\'esprit, améliore la gestion du stress et la lucidité.' },
  reseauter:  { label: 'Réseauter',           ic:'🤝', stats:{influence:2, popularite:1},    desc:'Construit des contacts utiles au sein de l\'école.' },
  creer:      { label: 'Projet personnel',    ic:'🎨', stats:{charisme:1, reputation:1, chance:1}, desc:'Développe un projet remarqué par vos camarades.' },
  tutorat:    { label: 'Cours particuliers',  ic:'🧑‍🏫', stats:{intelligence:1, reputation:1}, points: 90, desc:'Donne des cours payants à des élèves en difficulté : intelligence, réputation et argent.' },
  sortie:     { label: 'Sortie en ville',      ic:'🌆', stats:{charisme:2, popularite:1, chance:1}, desc:'Quitte le campus le temps d\'une soirée pour élargir son réseau social.' }
};

/* ---------------------------------------------------------------
   Rendez-vous planifiés (romance) — le joueur choisit un lieu puis
   une activité pour un rendez-vous avec un PNJ ; le lieu détermine
   surtout le risque d'être vu (donc le risque de triangle amoureux
   s'il mène plusieurs romances en parallèle), l'activité détermine
   surtout le gain relationnel selon le profil du PNJ.
   --------------------------------------------------------------- */
const DATE_LOCATIONS = {
  cafe:        { label:'Café discret',      ic:'☕', desc:'Ambiance calme et intime, loin des regards.', costPoints:0,   exposed:false },
  parc:        { label:'Parc du campus',    ic:'🌳', desc:'Simple, détendu, sans dépense — mais pas totalement à l\'abri des regards.', costPoints:0,   exposed:false },
  ville:       { label:'Sortie en ville',   ic:'🌆', desc:'Dynamique et mémorable, mais très visible de tous.', costPoints:60,  exposed:true },
  restaurant:  { label:'Restaurant chic',   ic:'🍽️', desc:'Impressionne fortement, coûte cher, et se remarque.', costPoints:150, exposed:true }
};

const DATE_ACTIVITIES = {
  discuter:   { label:'Discuter longuement',  ic:'💬', desc:'Renforce la confiance en douceur.',           costPoints:0,   matchArchetypes:['kind_hardworker','anxious_follower','loyal_protector','lone_wolf'] },
  etudier:    { label:'Réviser ensemble',     ic:'📖', desc:'Plaît aux esprits sérieux et méthodiques.',    costPoints:0,   matchArchetypes:['genius_hidden','cold_strategist','perfectionist'] },
  sport:      { label:'Activité sportive',    ic:'🏃', desc:'Plaît aux tempéraments actifs et compétitifs.', costPoints:20,  matchArchetypes:['athletic_rival','idealist_rebel'] },
  cadeau:     { label:'Offrir un cadeau',     ic:'🎁', desc:'Effet fort et quasi garanti, mais coûteux.',   costPoints:120, matchArchetypes:['charming_socialite','sly_manipulator','silver_tongue','ambitious_leader','chameleon','gossip'] }
};

/** Bonus d'affinité si l'activité choisie correspond au profil du PNJ. */
function dateActivityMatchBonus(npc, activityId){
  const act = DATE_ACTIVITIES[activityId];
  return (act && act.matchArchetypes.includes(npc.archetype)) ? 1 : 0;
}

/** Retourne le rendez-vous en attente avec ce PNJ, s'il y en a un déjà planifié. */
function getPendingDateForNpc(state, npcId){
  return (state.player.pendingConsequences || []).find(c => c.kind === 'date' && c.data.npcId === npcId) || null;
}

/** Planifie un rendez-vous (lieu + activité) pour la semaine suivante. Retourne {ok, reason?}. */
function scheduleDate(state, npcId, locationId, activityId){
  const npc = getNpc(state, npcId);
  const loc = DATE_LOCATIONS[locationId];
  const act = DATE_ACTIVITIES[activityId];
  if (!npc || !loc || !act) return { ok:false, reason:'invalide' };
  const rel = getRel(state, npcId);
  if (rel.type === 'ennemi' || rel.type === 'rival') return { ok:false, reason:'relation hostile' };
  if (getPendingDateForNpc(state, npcId)) return { ok:false, reason:'déjà planifié' };
  const cost = (loc.costPoints||0) + (act.costPoints||0);
  if (state.player.points < cost) return { ok:false, reason:'points' };
  state.player.points -= cost;
  scheduleConsequence(state, { weeksFromNow: 1, kind:'date', data:{ npcId, locationId, activityId } });
  addJournalEntry(state, `Vous planifiez un rendez-vous avec ${npc.fullName} — ${loc.label} · ${act.label}.`, 'relation');
  return { ok:true };
}

/** Chance qu'un rendez-vous exposé mène à une découverte par un(e) autre partenaire actif(ve) (triangle amoureux). */
function maybeDateTriggersTriangle(state, datedNpcId, exposed){
  if (!exposed || state.crisis) return null;
  const romances = getActiveRomances(state);
  const otherOptions = romances.filter(id => id !== datedNpcId);
  if (!otherOptions.length) return null;
  if (Math.random() > 0.35) return null;
  const discovererId = pick(otherOptions);
  const discoverer = getNpc(state, discovererId);
  const datedNpc = getNpc(state, datedNpcId);
  if (!discoverer || !datedNpc || discoverer.status !== 'actif') return null;
  adjustRelation(state, discovererId, { affinity: -15, trust: -20 });
  const text = `On rapporte à ${discoverer.fullName} que vous avez été vu(e) en rendez-vous avec ${datedNpc.fullName}. La nouvelle se répand vite — une confrontation semble inévitable.`;
  addJournalEntry(state, text, 'majeur');
  startCrisisArc(state, 'triangle_amoureux', { discovererId, discovererName: discoverer.fullName, otherId: datedNpcId, otherName: datedNpc.fullName });
  return text;
}

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
const SETTINGS_KEY = 'cotn_settings_v1';
const Settings = {
  data: { muted: false, musicOn: false, musicIndex: 0 },
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

/* ---------------------------------------------------------------
   MUSIQUE — playlist de fond (4 pistes), lues en boucle.
   Indépendante des SFX : son propre bouton, son propre état persisté.
   --------------------------------------------------------------- */
const Music = {
  tracks: ['music/OpCote1.mp3', 'music/OpCote2.mp3', 'music/OpCote3.mp3', 'music/OpCote4.mp3'],
  names: ['Piste 1', 'Piste 2', 'Piste 3', 'Piste 4'],
  audio: null,
  index: 0,
  playing: false,
  init(){
    this.index = Settings.data.musicIndex || 0;
    this.audio = new Audio(this.tracks[this.index]);
    this.audio.volume = 0.45;
    this.audio.addEventListener('ended', () => this.next());
    this.renderMenu();
    this.updateButton();
    if (Settings.data.musicOn) this.play(true);
  },
  play(silentRetry){
    if (!this.audio) return;
    this.audio.play().then(() => {
      this.playing = true;
      Settings.data.musicOn = true; Settings.save();
      this.updateButton();
    }).catch(() => {
      // Lecture automatique bloquée par le navigateur : on retente au premier clic.
      if (silentRetry){
        const resume = () => { this.play(); document.removeEventListener('click', resume); };
        document.addEventListener('click', resume, { once:true });
      }
    });
  },
  pause(){
    if (!this.audio) return;
    this.audio.pause();
    this.playing = false;
    Settings.data.musicOn = false; Settings.save();
    this.updateButton();
  },
  toggle(){ this.playing ? this.pause() : this.play(); },
  next(){
    this.index = (this.index + 1) % this.tracks.length;
    Settings.data.musicIndex = this.index; Settings.save();
    this.audio.src = this.tracks[this.index];
    if (this.playing) this.audio.play().catch(() => {});
    this.renderMenu();
  },
  /** Choix explicite d'une piste par le joueur : bascule dessus et la lance. */
  selectTrack(idx){
    if (idx === this.index && this.playing) return;
    this.index = idx;
    Settings.data.musicIndex = idx; Settings.save();
    this.audio.src = this.tracks[idx];
    this.play();
    this.renderMenu();
  },
  renderMenu(){
    const menu = document.getElementById('hdr-music-menu');
    if (!menu) return;
    menu.innerHTML = this.names.map((name, i) => `
      <div class="hdr-music-menu__item${i === this.index ? ' hdr-music-menu__item--active' : ''}" data-idx="${i}">
        <span>${escapeHtml(name)}</span><span class="hdr-music-menu__check">✓</span>
      </div>`).join('');
    menu.querySelectorAll('.hdr-music-menu__item').forEach(item => {
      item.addEventListener('click', () => {
        this.selectTrack(parseInt(item.dataset.idx, 10));
        menu.classList.remove('open');
        const caret = document.getElementById('hdr-music-caret');
        if (caret) caret.classList.remove('hdr-music-caret--open');
        SFX.play('click');
      });
    });
  },
  updateButton(){
    const btn = document.getElementById('hdr-music');
    if (!btn) return;
    btn.classList.toggle('hdr-music--on', this.playing);
    btn.textContent = this.playing ? '🎶' : '🎵';
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
        partnerId: null,
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
    // Forme 1 à 2 couples par classe au démarrage : deux PNJ mutuellement liés par un lien fort.
    const available = members.slice();
    const coupleCount = rndInt(1, 2);
    for (let c = 0; c < coupleCount && available.length >= 2; c++){
      const a = available.splice(rndInt(0, available.length - 1), 1)[0];
      const bIdx = rndInt(0, available.length - 1);
      const b = available.splice(bIdx, 1)[0];
      a.partnerId = b.id; b.partnerId = a.id;
      a.bonds[b.id] = rndInt(65, 90); b.bonds[a.id] = rndInt(65, 90);
    }
  });

  return npcs;
}

/* ================================================================
   3. MODÈLE DE SAUVEGARDE + SAVEMANAGER
   ================================================================ */

const SAVE_KEY = 'cotn_savefile_v1';

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
  clear(){ localStorage.removeItem(SAVE_KEY); },
  /** Télécharge la sauvegarde actuelle sous forme de fichier .json (sécurité contre la perte du localStorage). */
  exportToFile(){
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw){ toast('Aucune sauvegarde à exporter.', 'bad'); return; }
    try{
      const state = JSON.parse(raw);
      const name = (state && state.player && state.player.name) ? state.player.name.replace(/[^a-z0-9]+/gi, '_') : 'dossier';
      const blob = new Blob([raw], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const d = new Date();
      const stamp = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
      a.href = url;
      a.download = `cotn_${name}_${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast('Sauvegarde exportée.', 'good');
    } catch(e){
      console.error('Erreur d\'export', e);
      toast('Échec de l\'export.', 'bad');
    }
  },
  /** Importe un fichier .json exporté précédemment et l'installe comme sauvegarde active. */
  importFromFile(file, onDone){
    const reader = new FileReader();
    reader.onload = () => {
      try{
        const parsed = JSON.parse(reader.result);
        if (!parsed || !parsed.player || !Array.isArray(parsed.npcs)) throw new Error('format invalide');
        localStorage.setItem(SAVE_KEY, JSON.stringify(parsed));
        toast('Sauvegarde importée avec succès.', 'good');
        if (onDone) onDone(true);
      } catch(e){
        console.error('Erreur d\'import', e);
        toast('Fichier de sauvegarde invalide.', 'bad');
        if (onDone) onDone(false);
      }
    };
    reader.onerror = () => { toast('Impossible de lire le fichier.', 'bad'); if (onDone) onDone(false); };
    reader.readAsText(file);
  }
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
    clubId: null,
    inventory: [],
    relationships: {},          // npcId -> {affinity,trust,fear,type}
    knownSecrets: [],           // npcId list
    teacherDossiers: {},        // teacherId -> {evidence, status}
    flags: {},
    journal: [],
    examHistory: [],
    unlockedAchievements: [],
    playstyle: { manipulateur:0, leader:0, strategue:0, combattant:0, discret:0 },
    lastJournalSeenCount: 0,
    consecutiveExamFails: 0,
    pendingConsequences: [],
    loan: { amount: 0, dueInWeeks: 0, principal: 0 },
    lastLocationVisit: null   // { year, week, locId } — un seul lieu de l'école visitable par semaine
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
    crisis: null,                // { label, weeksLeft, kind?, stageIndex?, weeksUntilNextStage?, data? } — crise durable en cours, s'il y en a une (arc à étapes si `kind` correspond à un CRISIS_ARCS, sinon simple décompte)
    majorCrisisThisYear: false,  // remis à false à chaque nouvelle année ; sert de filet de sécurité pour garantir une crise majeure en année 3
    goals: STORY_GOAL_DEFS.map(g => ({ id: g.id, status: 'active', rivalNpcId: null })),
    shopStock: SHOP_ITEMS.reduce((acc, it) => { if (it.stock != null) acc[it.id] = it.stock; return acc; }, {}),
    stats_meta: { examsCompleted: 0, alliancesFormed: 0, betrayals: 0, secretsDiscovered: 0, maxConcurrentRomances: 0, teachersDefeated: 0, framedExpulsions: 0, frameBackfires: 0, blackMarketWins: 0, uniqueActivitiesUsed: [], socialDestructions: 0, couplesBroken: 0, whiteRoomDefeated: 0 },
    whiteRoom: { active:false, npcId:null, stage:'none', attention:0, clues:0, sabotageCount:0 },
    rumors: []
  };

  maybeSpawnWhiteRoomStudent(state);

  // planning par défaut
  WEEKDAYS.forEach(d => { state.planning[d] = (d === 'Samedi' || d === 'Dimanche') ? 'reposer' : 'etudier'; });

  // relations initiales : le joueur "connaît" tous les élèves de sa classe
  npcs.filter(n => n.classId === 'D').forEach(n => {
    player.relationships[n.id] = { affinity: rndInt(0,15), trust: rndInt(0,10), fear: 0, type: 'connaissance' };
  });

  addJournalEntry(state, `Dossier d'admission validé. Bienvenue à LNHS, ${player.name}. Vous intégrez la classe 1-D.`, 'system');

  return state;
}

function addJournalEntry(state, text, type){
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
  // Ne rétrograde pas automatiquement une romance, une alliance ou une ex-relation
  // déjà forgées manuellement, sauf chute drastique de l'affinité.
  if (rel.type === 'romance' && rel.affinity < 20){ rel.type = 'rival'; return; }
  if (rel.type === 'allié' && rel.affinity < -10){ rel.type = 'ennemi'; return; }
  if (rel.type === 'romance' || rel.type === 'allié' || rel.type === 'ennemi' || rel.type === 'ex') return;

  if (rel.affinity >= 70) rel.type = 'ami proche';
  else if (rel.affinity >= 35) rel.type = 'ami';
  else if (rel.affinity <= -50) rel.type = 'ennemi';
  else if (rel.affinity <= -20) rel.type = 'rival';
  else if (rel.affinity !== 0 || rel.trust !== 0) rel.type = 'connaissance';
  else rel.type = 'inconnu';
}

/** Liste des npcId actuellement en relation romantique active avec le joueur. */
function getActiveRomances(state){
  return Object.entries(state.player.relationships)
    .filter(([, rel]) => rel.type === 'romance')
    .map(([id]) => id);
}

const RELATIONSHIP_STYLE_LABELS = {
  exclusive: 'Relation exclusive',
  libre: 'Relations multiples (harem)'
};

function relColor(type){
  switch(type){
    case 'ami proche': return '#2fbf8f';
    case 'ami': return '#4ecdc4';
    case 'allié': return '#ffb347';
    case 'romance': return '#ff6b9d';
    case 'ex': return '#b39ddb';
    case 'connaissance': return '#8fa3c9';
    case 'rival': return '#ff9f45';
    case 'ennemi': return '#ff5c5c';
    default: return '#7c6faa';
  }
}

/* ================================================================
   5bis. RÉSEAU SOCIAL DES PNJ (amitiés / rivalités entre élèves)
   ================================================================
   Les PNJ ont déjà entre eux un réseau de liens (n.bonds), initialisé
   à la génération et qui évolue chaque semaine dans simulateNpcWeek.
   Les fonctions ci-dessous l'exploitent pour que les conséquences des
   actions du joueur (trahison, complot) se propagent de façon crédible
   dans l'entourage des PNJ, et pour l'afficher dans l'interface.
   ================================================================ */

/** Élèves proches (amis) d'un PNJ donné, d'après son réseau de liens internes. */
function getNpcFriends(state, npcId, minBond){
  minBond = minBond == null ? 35 : minBond;
  const npc = getNpc(state, npcId);
  if (!npc || !npc.bonds) return [];
  return Object.entries(npc.bonds).filter(([, v]) => v >= minBond).map(([id]) => id);
}

/** Élèves en froid avec un PNJ donné, d'après son réseau de liens internes. */
function getNpcRivalsWeb(state, npcId, maxBond){
  maxBond = maxBond == null ? -35 : maxBond;
  const npc = getNpc(state, npcId);
  if (!npc || !npc.bonds) return [];
  return Object.entries(npc.bonds).filter(([, v]) => v <= maxBond).map(([id]) => id);
}

/* ================================================================
   5ter. RUMEURS
   ================================================================
   Les rumeurs vivent leur propre vie : elles apparaissent, enflent,
   influencent réputation/popularité tant qu'elles sont fortes, puis
   s'éteignent. Elles peuvent viser le joueur ou n'importe quel PNJ.
   ================================================================ */

const RUMOR_TEXT_POOL = {
  bad: [
    "manipulerait pas mal de monde pour arriver à ses fins",
    "aurait triché lors d'un examen récent",
    "aurait trahi la confiance d'un(e) allié(e)",
    "cacherait un jeu bien plus trouble qu'il/elle n'y paraît",
    "aurait acheté sa réussite à prix d'or"
  ],
  good: [
    "aurait discrètement aidé un(e) camarade en difficulté",
    "ferait preuve d'une loyauté rare",
    "aurait tenu tête à l'administration pour défendre sa classe",
    "serait bien plus brillant(e) qu'il/elle ne le montre"
  ],
  neutral: [
    "aurait un rapport secret avec un(e) enseignant(e)",
    "ne serait pas vraiment celui/celle qu'on croit",
    "cacherait un lien avec la Classe A"
  ]
};

/** Crée une rumeur, ou renforce la rumeur déjà active sur le même sujet. */
function addRumor(state, { subjectId, subjectName, valence, strength, sourceId }){
  if (!state.rumors) state.rumors = [];
  const existing = state.rumors.find(r => r.subjectId === subjectId);
  const pool = RUMOR_TEXT_POOL[valence] || RUMOR_TEXT_POOL.neutral;
  if (existing){
    existing.strength = clamp(existing.strength + strength, 0, 100);
    existing.valence = valence;
    return existing;
  }
  const rumor = {
    id: uid('rumor'), subjectId, subjectName, valence,
    strength: clamp(strength, 0, 100), text: pick(pool), sourceId: sourceId || null
  };
  state.rumors.push(rumor);
  return rumor;
}

/** Chaque semaine : les rumeurs actives s'estompent, mais pèsent sur réputation/popularité tant qu'elles sont fortes. */
function decayRumors(state){
  if (!state.rumors) state.rumors = [];
  const stillActive = [];
  state.rumors.forEach(rumor => {
    const isPlayer = rumor.subjectId === 'player';
    const target = isPlayer ? state.player.stats : (getNpc(state, rumor.subjectId) || {}).stats;
    if (target && rumor.strength >= 25 && rumor.valence !== 'neutral'){
      const sign = rumor.valence === 'bad' ? -1 : 1;
      target.reputation = clamp(target.reputation + sign, 0, 100);
      if (target.popularite != null) target.popularite = clamp(target.popularite + sign, 0, 100);
    }
    rumor.strength -= rndInt(6, 14);
    if (rumor.strength > 0) stillActive.push(rumor);
    else if (isPlayer) addJournalEntry(state, `La rumeur qui circulait à votre sujet finit par s'éteindre.`, 'rumeur');
  });
  state.rumors = stillActive;
}

/** Petite chance chaque semaine qu'une rumeur ambiante apparaisse dans l'école, sans intervention du joueur. */
function maybeSpawnAmbientRumor(state){
  if (!state.rumors) state.rumors = [];
  if (state.rumors.length >= 4 || Math.random() > 0.22) return null;
  const active = state.npcs.filter(n => n.status === 'actif');
  const pool = active.filter(n => !state.rumors.some(r => r.subjectId === n.id));
  if (!pool.length) return null;
  const subject = pick(pool);
  const valence = pick(['bad', 'good', 'neutral']);
  const rumor = addRumor(state, { subjectId: subject.id, subjectName: subject.fullName, valence, strength: rndInt(30, 55) });
  addJournalEntry(state, `Une rumeur commence à circuler : ${subject.fullName} ${rumor.text}.`, 'rumeur');
  return rumor;
}

/* ================================================================
   5quater. CONSÉQUENCES DIFFÉRÉES
   ================================================================
   Certains actes (trahisons, corruption, complots) ne révèlent leurs
   effets que plus tard : l'impact des choix du joueur reste ainsi
   visible et rattaché à leur cause, plutôt qu'instantané et oublié.
   ================================================================ */

function scheduleConsequence(state, { weeksFromNow, kind, data }){
  if (!state.player.pendingConsequences) state.player.pendingConsequences = [];
  let week = state.time.week + Math.max(1, weeksFromNow);
  let year = state.time.year;
  while (week > WEEKS_PER_YEAR){ week -= WEEKS_PER_YEAR; year++; }
  state.player.pendingConsequences.push({ id: uid('cons'), dueYear: year, dueWeek: week, kind, data: data || {} });
}

function processPendingConsequences(state){
  if (!state.player.pendingConsequences) state.player.pendingConsequences = [];
  const due = state.player.pendingConsequences.filter(c =>
    c.dueYear < state.time.year || (c.dueYear === state.time.year && c.dueWeek <= state.time.week));
  if (!due.length) return [];
  const dueIds = new Set(due.map(c => c.id));
  state.player.pendingConsequences = state.player.pendingConsequences.filter(c => !dueIds.has(c.id));
  const results = [];
  due.forEach(c => { const r = resolvePendingConsequence(state, c); if (r) results.push(r); });
  return results;
}

function resolvePendingConsequence(state, c){
  switch (c.kind){
    case 'betrayal_spreads': {
      const npc = getNpc(state, c.data.npcId);
      if (!npc || npc.status !== 'actif') return null;
      const friends = getNpcFriends(state, npc.id).filter(id => { const f = getNpc(state, id); return f && f.status === 'actif'; });
      if (!friends.length) return null;
      friends.forEach(id => adjustRelation(state, id, { affinity: -12, trust: -10 }));
      state.player.stats.reputation = clamp(state.player.stats.reputation - rndInt(2, 6), 0, 100);
      addRumor(state, { subjectId: 'player', subjectName: state.player.name, valence: 'bad', strength: rndInt(25, 45) });
      const names = friends.map(id => getNpc(state, id).fullName).join(', ');
      const text = `L'entourage de ${npc.fullName} finit par apprendre votre trahison passée. ${names} vous en veulent désormais.`;
      addJournalEntry(state, text, 'betrayal');
      return { text, kind: 'bad' };
    }
    case 'bribery_leak': {
      const npc = getNpc(state, c.data.npcId);
      if (!npc) return null;
      state.player.stats.reputation = clamp(state.player.stats.reputation - rndInt(4, 9), 0, 100);
      addRumor(state, { subjectId: 'player', subjectName: state.player.name, valence: 'bad', strength: rndInt(30, 50) });
      const text = `On finit par découvrir que vous avez corrompu ${npc.fullName} il y a quelque temps. Votre réputation en pâtit.`;
      addJournalEntry(state, text, 'corruption');
      return { text, kind: 'bad' };
    }
    case 'frame_suspicion': {
      const pawn = getNpc(state, c.data.pawnId);
      if (!pawn) return null;
      const friends = getNpcFriends(state, c.data.targetId || '').filter(id => { const f = getNpc(state, id); return f && f.status === 'actif'; });
      const discoveryChance = clamp(0.15 + friends.length * 0.12, 0.1, 0.7);
      if (Math.random() < discoveryChance){
        adjustRelation(state, pawn.id, { affinity: -50, trust: -60 });
        getRel(state, pawn.id).type = 'ennemi';
        state.player.stats.reputation = clamp(state.player.stats.reputation - rndInt(10, 20), 0, 100);
        addRumor(state, { subjectId: 'player', subjectName: state.player.name, valence: 'bad', strength: rndInt(40, 65) });
        const text = `Les proches de ${c.data.targetName} finissent par reconstituer le complot monté avec ${pawn.fullName} — et remontent jusqu'à vous.`;
        addJournalEntry(state, text, 'majeur');
        return { text, kind: 'bad' };
      }
      return null;
    }
    case 'date': {
      const npc = getNpc(state, c.data.npcId);
      if (!npc || npc.status !== 'actif') return null;
      const loc = DATE_LOCATIONS[c.data.locationId];
      const act = DATE_ACTIVITIES[c.data.activityId];
      if (!loc || !act) return null;
      const rel = getRel(state, npc.id);
      const bonus = dateActivityMatchBonus(npc, c.data.activityId);
      const successChance = clamp(0.5 + bonus*0.2 + rel.affinity/300 + (npc.mood-50)/300, 0.15, 0.92);
      let text;
      if (Math.random() < successChance){
        const gain = rndInt(6, 12) + bonus*8;
        adjustRelation(state, npc.id, { affinity: gain, trust: rndInt(2, 6) });
        text = `Votre rendez-vous avec ${npc.fullName} (${loc.label} · ${act.label}) se passe à merveille.`;
        if (bonus) text += ` Le choix de l'activité semblait fait pour ${npc.fullName}.`;
      } else {
        adjustRelation(state, npc.id, { affinity: -rndInt(2, 7) });
        text = `Le rendez-vous avec ${npc.fullName} (${loc.label}) tombe à plat — ${act.label.toLowerCase()} n'était visiblement pas le bon choix.`;
      }
      addJournalEntry(state, text, 'relation');
      maybeDateTriggersTriangle(state, npc.id, loc.exposed);
      return { text, kind: rel.affinity >= 0 ? 'good' : 'bad' };
    }
    default: return null;
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
  // l'entourage de la victime finit presque toujours par l'apprendre, un peu plus tard
  scheduleConsequence(state, { weeksFromNow: rndInt(1, 3), kind: 'betrayal_spreads', data: { npcId } });
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
    if (Math.random() < 0.3){
      scheduleConsequence(state, { weeksFromNow: rndInt(2, 4), kind: 'bribery_leak', data: { npcId } });
    }
  } else {
    addJournalEntry(state, `${npc.fullName} refuse votre corruption et s'en méfie désormais.`, 'corruption');
    rel.affinity = clamp(rel.affinity - 10, -100, 100);
    rememberNpc(state, npc, `A refusé une tentative de corruption de votre part.`);
  }
  return { success };
}

/* ---------------------------------------------------------------
   SYSTÈME DE DUEL — défi direct entre élèves (force, intelligence
   ou charisme), avec mise en jeu de points et de réputation.
   Limité à 2 duels par semaine (voir player.flags.duelsThisWeek,
   remis à zéro à chaque avancement de semaine dans Game.advanceWeek).
   --------------------------------------------------------------- */
const DUEL_DOMAINS = {
  force:        { label:'Défi physique',      ic:'🥊', statKey:'force',        style:'combattant',  desc:'Une épreuve de force pure. Rapide, brutal, sans détour.' },
  intelligence: { label:'Joute intellectuelle', ic:'♟️', statKey:'intelligence', style:'strategue',   desc:"Un duel d'esprit — logique, culture générale, sang-froid mental." },
  charisme:     { label:'Joute verbale',       ic:'🗣️', statKey:'charisme',     style:'leader',      desc:'Un affrontement de répartie et de présence, devant témoins.' }
};
const DUEL_STAKE = 150;
const DUEL_MAX_PER_WEEK = 2;

function duelsRemainingThisWeek(state){
  return DUEL_MAX_PER_WEEK - (state.player.flags.duelsThisWeek || 0);
}

/** Résout un duel entre le joueur et un PNJ dans un domaine donné. Retourne {win, text}. */
function attemptDuel(state, npcId, domain){
  const npc = getNpc(state, npcId);
  const def = DUEL_DOMAINS[domain];
  if (!npc || !def) return { win:false, text:"Ce duel n'a pas pu avoir lieu." };
  if (duelsRemainingThisWeek(state) <= 0){
    return { win:false, text:'Vous avez déjà relevé assez de défis cette semaine — inutile de vous épuiser davantage.' };
  }
  state.player.flags.duelsThisWeek = (state.player.flags.duelsThisWeek || 0) + 1;

  const rel = getRel(state, npcId);
  const stake = Math.min(DUEL_STAKE, state.player.points);

  const playerScore = state.player.stats[def.statKey] + rndInt(0, 18) + Math.round(state.player.stats.chance / 5);
  const npcScore = npc.stats[def.statKey] + rndInt(0, 18);
  // en cas d'égalité serrée, le sang-froid départage
  const win = (Math.abs(playerScore - npcScore) <= 3)
    ? (state.player.stats.sangFroid >= npc.stats.sangFroid)
    : (playerScore > npcScore);

  bumpStyle(state, def.style, 2);

  if (win){
    state.player.points += stake;
    state.player.stats.reputation = clamp(state.player.stats.reputation + 2, 0, 100);
    state.player.stats.popularite = clamp(state.player.stats.popularite + 1, 0, 100);
    state.stats_meta.duelsWon = (state.stats_meta.duelsWon || 0) + 1;
    if (rel.type === 'ennemi' || rel.type === 'rival'){
      rel.fear = clamp(rel.fear + 5, -100, 100);
      rel.affinity = clamp(rel.affinity + 2, -100, 100);
    } else {
      rel.affinity = clamp(rel.affinity + 3, -100, 100);
    }
    recomputeRelType(rel);
    addJournalEntry(state, `Vous remportez un ${def.label.toLowerCase()} contre ${npc.fullName} (+${stake} pts, +2 réputation).`, 'defi');
    rememberNpc(state, npc, `A perdu un duel (${def.label.toLowerCase()}) contre vous.`);
    return { win:true, text:`Victoire nette face à ${npc.fullName} ! Vous empochez ${stake} points et gagnez en réputation.` };
  } else {
    state.player.points = clamp(state.player.points - stake, 0, Infinity);
    state.player.stats.reputation = clamp(state.player.stats.reputation - 1, 0, 100);
    rel.affinity = clamp(rel.affinity - (rel.type === 'ami' || rel.type === 'ami proche' ? 1 : 3), -100, 100);
    recomputeRelType(rel);
    addJournalEntry(state, `Vous perdez un ${def.label.toLowerCase()} face à ${npc.fullName} (-${stake} pts).`, 'defi');
    rememberNpc(state, npc, `Vous a battu(e) en duel (${def.label.toLowerCase()}).`);
    return { win:false, text:`Défaite face à ${npc.fullName}. Vous perdez ${stake} points et un peu de réputation.` };
  }
}

/* ---------------------------------------------------------------
   SYSTÈME DE PRÊT — un prêteur sur gages permet d'emprunter des
   points personnels contre intérêts. Un prêt non remboursé à temps
   est prélevé de force (et pénalisé) au moment de l'échéance,
   voir updateLoanStatus() appelée depuis Game.advanceWeek().
   --------------------------------------------------------------- */
const LOAN_OFFERS = [
  { principal: 200,  rate: 1.4, weeks: 4 },
  { principal: 500,  rate: 1.5, weeks: 4 },
  { principal: 1000, rate: 1.65, weeks: 5 }
];

/** Retourne l'état du prêt du joueur, en l'initialisant si la sauvegarde est antérieure à cette mécanique. */
function getLoan(state){
  if (!state.player.loan) state.player.loan = { amount: 0, dueInWeeks: 0, principal: 0 };
  return state.player.loan;
}

function takeLoan(state, offer){
  const loan = getLoan(state);
  if (loan.amount > 0) return { success:false, text:'Le prêteur refuse : vous avez déjà une dette en cours envers lui.' };
  const owed = Math.round(offer.principal * offer.rate);
  state.player.loan = { amount: owed, dueInWeeks: offer.weeks, principal: offer.principal };
  state.player.points += offer.principal;
  addJournalEntry(state, `Vous empruntez ${offer.principal} points au prêteur sur gages. ${owed} points seront dus dans ${offer.weeks} semaines.`, 'dette');
  return { success:true, text:`${offer.principal} points crédités immédiatement. ${owed} points seront exigés dans ${offer.weeks} semaines — ne l'oubliez pas.` };
}

function repayLoan(state){
  const loan = getLoan(state);
  if (loan.amount <= 0) return { success:false, text:'Vous n\u2019avez aucune dette en cours.' };
  if (state.player.points < loan.amount) return { success:false, text:'Vous n\u2019avez pas assez de points pour solder cette dette maintenant.' };
  state.player.points -= loan.amount;
  const cleared = loan.amount;
  state.player.loan = { amount: 0, dueInWeeks: 0, principal: 0 };
  state.player.stats.reputation = clamp(state.player.stats.reputation + 2, 0, 100);
  state.stats_meta.loansRepaid = (state.stats_meta.loansRepaid || 0) + 1;
  addJournalEntry(state, `Vous remboursez intégralement votre dette (${cleared} points). Réputation +2.`, 'dette');
  return { success:true, text:`Dette soldée : ${cleared} points versés. Le prêteur vous salue — pour l'instant.` };
}

/** Fait avancer l'échéance du prêt d'une semaine ; gère le prélèvement forcé en cas de retard. Retourne un texte d'alerte ou null. */
function updateLoanStatus(state){
  const loan = getLoan(state);
  if (loan.amount <= 0) return null;
  loan.dueInWeeks--;
  if (loan.dueInWeeks > 0) return null;

  if (state.player.points >= loan.amount){
    const owed = loan.amount;
    state.player.points -= owed;
    state.player.loan = { amount: 0, dueInWeeks: 0, principal: 0 };
    const txt = `Le prêteur sur gages se présente et prélève ${owed} points dus, sans discussion possible. Dette soldée de force.`;
    addJournalEntry(state, txt, 'dette');
    return txt;
  }
  // insolvable : saisie de tout ce qu'il reste, dette qui s'alourdit, réputation entachée
  const seized = state.player.points;
  state.player.points = 0;
  const remaining = Math.max(loan.amount - seized, 50);
  loan.amount = Math.round(remaining * 1.3);
  loan.dueInWeeks = 3;
  state.player.stats.reputation = clamp(state.player.stats.reputation - 8, 0, 100);
  const txt = seized > 0
    ? `Incapable de rembourser, vous êtes dépouillé(e) de vos ${seized} points restants. La dette grimpe désormais à ${loan.amount} points, exigibles sous 3 semaines. Réputation -8.`
    : `Incapable de rembourser, vous n'avez rien à céder — mais votre dette grimpe à ${loan.amount} points, exigibles sous 3 semaines, et votre réputation en pâtit lourdement. Réputation -8.`;
  addJournalEntry(state, txt, 'majeur');
  return txt;
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

/** Un(e) élève peut-il/elle être manipulé(e) pour porter une fausse accusation ? (confiance, peur ou alliance suffisante) */
function canBeManipulatedIntoFraming(state, pawnId){
  const rel = getRel(state, pawnId);
  return rel.type === 'allié' || rel.trust >= 25 || rel.fear >= 30;
}

/**
 * Tente de pousser un(e) élève (le "pion") à faire accuser/exclure un(e) autre élève (la "cible").
 * Se déroule en un seul jet, mais dépend de trois facteurs : la disposition du pion à agir pour
 * vous, la solidité de l'accusation (influence, secret connu sur la cible) et la défense de la
 * cible (réputation, popularité, sang-froid).
 */
function attemptFrameUp(state, pawnId, targetId){
  const pawn = getNpc(state, pawnId);
  const target = getNpc(state, targetId);
  const pawnRel = getRel(state, pawnId);

  // -- Étape 1 : le pion accepte-t-il de porter l'accusation pour vous ? --
  const willingness = clamp(0.15 + pawnRel.fear/150 + pawnRel.trust/300 + (pawnRel.type === 'allié' ? 0.2 : 0) - pawn.stats.sangFroid/300, 0.05, 0.85);
  if (Math.random() >= willingness){
    adjustRelation(state, pawnId, { trust: -8, affinity: -6 });
    rememberNpc(state, pawn, `A refusé de porter une fausse accusation contre ${target.fullName} pour vous.`);
    return { outcome:'refuse', text:`${pawn.fullName} refuse net de se compromettre pour accuser ${target.fullName}.` };
  }

  // -- Étape 2 : l'accusation tient-elle face à la défense de la cible ? --
  // Le secret pesait auparavant très lourd (+25) et suffisait quasiment à lui
  // seul à garantir l'exclusion dès une influence correcte. L'administration
  // résiste désormais bien davantage à une accusation, même bien montée.
  const hasSecret = state.player.knownSecrets.includes(targetId);
  const frameStrength = state.player.stats.influence * 0.35 + pawn.stats.charisme * 0.18 + (hasSecret ? 15 : 0) + rndInt(0, 8);
  const targetDefense = 8 + target.stats.reputation * 0.5 + target.stats.popularite * 0.32 + target.stats.sangFroid * 0.22;
  const margin = frameStrength - targetDefense;

  if (margin > 26){
    target.status = 'expulse';
    getRel(state, targetId).type = 'inconnu';
    adjustRelation(state, pawnId, { trust: 6, fear: 4 });
    state.player.stats.influence = clamp(state.player.stats.influence + 3, 0, 100);
    state.stats_meta.framedExpulsions = (state.stats_meta.framedExpulsions || 0) + 1;
    bumpStyle(state, 'manipulateur', 8);
    const txt = `Convaincu(e) par ${pawn.fullName}, l'administration exclut ${target.fullName} de LNHS. Personne ne remonte jusqu'à vous... pour l'instant.`;
    addJournalEntry(state, txt, 'majeur');
    scheduleConsequence(state, { weeksFromNow: rndInt(2, 5), kind: 'frame_suspicion', data: { pawnId, targetId, targetName: target.fullName } });
    return { outcome:'success', text: txt };
  }

  if (margin > -10){
    adjustRelation(state, targetId, { affinity: -20, trust: -15 });
    getRel(state, targetId).type = 'rival';
    rememberNpc(state, target, `Soupçonne d'avoir été visé(e) par une accusation montée de toutes pièces, sans preuve suffisante.`);
    return { outcome:'partial', text:`L'accusation portée par ${pawn.fullName} est examinée mais jugée insuffisante : ${target.fullName} reste à LNHS, méfiant(e) désormais.` };
  }

  // -- Échec : le complot est découvert, il se retourne contre le pion et contre vous --
  const rel = getRel(state, pawnId);
  rel.type = 'ennemi';
  rel.affinity = clamp(rel.affinity - 70, -100, 100);
  rel.trust = clamp(rel.trust - 60, -100, 100);
  state.player.stats.reputation = clamp(state.player.stats.reputation - rndInt(12, 22), 0, 100);
  state.player.stats.popularite = clamp(state.player.stats.popularite - rndInt(4, 10), 0, 100);
  state.stats_meta.frameBackfires = (state.stats_meta.frameBackfires || 0) + 1;
  rememberNpc(state, pawn, `A été piégé(e) dans une fausse accusation orchestrée par vous contre ${target.fullName}, et l'a découvert.`);
  const txt = `Le complot s'effondre : ${pawn.fullName} comprend avoir été manipulé(e), et l'administration remonte jusqu'à vous. Réputation gravement entachée.`;
  addJournalEntry(state, txt, 'majeur');
  return { outcome:'backfire', text: txt };
}

/**
 * Tente de briser le couple formé par un(e) élève et son/sa partenaire.
 * Le succès dépend du charisme/influence du joueur et d'un éventuel secret
 * connu sur l'un des deux, opposés à la solidité du couple (bonds mutuels).
 * En cas de franc succès, l'un(e) des deux se rapproche même du joueur.
 */
function attemptBreakupCouple(state, npcId){
  const npc = getNpc(state, npcId);
  if (!npc || !npc.partnerId) return { outcome:'invalid', text:`${npc ? npc.fullName : 'Cet(te) élève'} n'est en couple avec personne.` };
  const partner = getNpc(state, npc.partnerId);
  if (!partner || partner.status !== 'actif'){ npc.partnerId = null; return { outcome:'invalid', text:`Le couple n'existe déjà plus.` }; }

  const coupleStrength = ((npc.bonds[partner.id] || 40) + (partner.bonds[npc.id] || 40)) / 2;
  const hasSecretOnEither = state.player.knownSecrets.includes(npc.id) || state.player.knownSecrets.includes(partner.id);
  const power = state.player.stats.charisme * 0.35 + state.player.stats.influence * 0.35 + (hasSecretOnEither ? 20 : 0) + rndInt(0, 12);
  const resistance = coupleStrength * 0.7 + (npc.stats.sangFroid + partner.stats.sangFroid) / 8;
  const margin = power - resistance;

  if (margin > 12){
    npc.partnerId = null; partner.partnerId = null;
    state.stats_meta.couplesBroken = (state.stats_meta.couplesBroken || 0) + 1;
    adjustRelation(state, npc.id, { affinity: -20, trust: -10 });
    adjustRelation(state, partner.id, { affinity: -20, trust: -10 });
    bumpStyle(state, 'manipulateur', 5);
    rememberNpc(state, npc, `A vu son couple avec ${partner.fullName} voler en éclats après votre intervention.`);
    rememberNpc(state, partner, `A vu son couple avec ${npc.fullName} voler en éclats après votre intervention.`);
    let bonusTxt = '';
    if (Math.random() < 0.4 + state.player.stats.charisme/300){
      const target = pick([npc, partner]);
      adjustRelation(state, target.id, { affinity: 14, trust: 6 });
      bonusTxt = ` ${target.fullName} semble même vous en être reconnaissant(e), à sa façon.`;
    }
    const txt = `Le couple ${npc.fullName} / ${partner.fullName} explose, rongé par le doute que vous avez semé.${bonusTxt}`;
    addJournalEntry(state, txt, 'majeur');
    return { outcome:'success', text: txt };
  }
  if (margin > -12){
    adjustRelation(state, npc.id, { affinity: -6 });
    return { outcome:'partial', text:`Vous semez le doute, mais ${npc.fullName} et ${partner.fullName} restent ensemble — pour l'instant.` };
  }
  adjustRelation(state, npc.id, { affinity: -10, trust: -10 });
  adjustRelation(state, partner.id, { affinity: -10, trust: -10 });
  getRel(state, npc.id).type = 'ennemi';
  state.player.stats.reputation = clamp(state.player.stats.reputation - rndInt(6, 14), 0, 100);
  const txt = `${npc.fullName} et ${partner.fullName} comprennent votre manœuvre et resserrent les rangs contre vous. Réputation en baisse.`;
  addJournalEntry(state, txt, 'majeur');
  return { outcome:'backfire', text: txt };
}

/**
 * Campagne de destruction sociale : combine rumeurs et pression pour pousser
 * un(e) élève à quitter LNHS de son plein gré (sans passer par l'administration,
 * contrairement à attemptFrameUp). Solution non-violente pour « éliminer »
 * durablement un(e) rival(e) du jeu. Nécessite un secret connu sur la cible.
 */
function attemptSocialDestruction(state, targetId){
  const target = getNpc(state, targetId);
  if (!target || target.status !== 'actif') return { outcome:'invalid', text:`Cette cible n'est plus disponible.` };
  if (!state.player.knownSecrets.includes(targetId)){
    return { outcome:'invalid', text:`Vous n'avez aucun levier exploitable sur ${target.fullName} : trouvez d'abord un secret sur lui/elle.` };
  }
  // Le seuil de succès est nettement plus exigeant qu'avant, et la résistance
  // de la cible pèse davantage : pousser quelqu'un à quitter l'école de son
  // plein gré doit rester difficile, surtout face à un(e) élève bien intégré(e).
  const power = state.player.stats.influence * 0.32 + state.player.stats.popularite * 0.22 + state.player.stats.reputation * 0.14 + rndInt(0, 10);
  const resistance = 10 + target.stats.sangFroid * 0.55 + target.stats.popularite * 0.35 + target.stats.reputation * 0.25;
  const margin = power - resistance;

  addRumor(state, { subjectId: targetId, subjectName: target.fullName, valence: 'bad', strength: rndInt(45, 70), sourceId: 'player' });

  if (margin > 30){
    target.status = 'absent';
    target.absentWeeksLeft = 999; // ne revient jamais : quitte l'école
    getRel(state, targetId).type = 'ennemi';
    state.player.stats.influence = clamp(state.player.stats.influence + 4, 0, 100);
    state.stats_meta.socialDestructions = (state.stats_meta.socialDestructions || 0) + 1;
    bumpStyle(state, 'manipulateur', 8);
    const txt = `Rongé(e) par la pression sociale et les rumeurs, ${target.fullName} finit par demander son transfert loin de LNHS. Vous n'y êtes pour rien... officiellement.`;
    addJournalEntry(state, txt, 'majeur');
    return { outcome:'success', text: txt };
  }
  if (margin > -8){
    state.player.stats.popularite = clamp(state.player.stats.popularite + 2, 0, 100);
    const txt = `${target.fullName} traverse une période difficile, isolé(e) par la rumeur, mais tient bon pour l'instant.`;
    addJournalEntry(state, txt, 'evenement');
    return { outcome:'partial', text: txt };
  }
  state.player.stats.reputation = clamp(state.player.stats.reputation - rndInt(10, 18), 0, 100);
  const txt = `La rumeur est retracée jusqu'à vous. ${target.fullName} s'en sort, et c'est votre réputation qui trinque.`;
  addJournalEntry(state, txt, 'majeur');
  return { outcome:'backfire', text: txt };
}

/**
 * Option extrême, volontairement quasi hors d'atteinte : au lieu de faire exclure
 * ou fuir un(e) élève, tenter de le/la faire disparaître définitivement. Reste
 * entièrement dans le registre narratif et allusif du jeu — aucune méthode n'est
 * jamais décrite — et n'apparaît que dans les conditions les plus extrêmes (voir
 * canAttemptElimination). Les chances de réussite plafonnent volontairement très
 * bas, et un échec n'est jamais une simple mauvaise surprise : il met fin à la
 * partie dans les pires conditions possibles. Seule exception : un build
 * absolument parfait (voir isPerfectEliminationBuild) garantit 100% de réussite —
 * mais atteindre ce niveau sur les quatre stats en même temps est quasiment
 * impossible en une partie normale.
 */
function canAttemptElimination(state, targetId){
  const rel = getRel(state, targetId);
  const npc = getNpc(state, targetId);
  if (!npc || npc.status !== 'actif') return false;
  return rel.type === 'ennemi'
    && rel.affinity <= -80
    && rel.fear >= 40
    && state.player.stats.sangFroid >= 85
    && state.player.knownSecrets.includes(targetId);
}

/** Build "parfait" : les quatre stats qui comptent pour cette action doivent
 * toutes être au plafond absolu (100/100) en même temps. Vu le coût et le temps
 * nécessaires pour monter ne serait-ce qu'une seule stat à 100, réunir les
 * quatre simultanément relève quasiment de la run dédiée à cet unique objectif. */
function isPerfectEliminationBuild(state){
  const st = state.player.stats;
  return st.sangFroid >= 100 && st.influence >= 100 && st.chance >= 100 && st.intelligence >= 100;
}

function attemptEliminate(state, targetId){
  const target = getNpc(state, targetId);
  if (!target || target.status !== 'actif') return { outcome:'invalid', text:`Cette cible n'est plus disponible.` };

  const perfectBuild = isPerfectEliminationBuild(state);
  const power = state.player.stats.sangFroid * 0.25 + state.player.stats.influence * 0.12 + state.player.stats.chance * 0.15 + rndInt(0, 8);
  const resistance = 60 + target.stats.chance * 0.25 + target.stats.sangFroid * 0.15;
  // Chance de réussite plafonnée très bas (12% maximum) — sauf build parfait, qui garantit 100%.
  const chance = perfectBuild ? 1 : clamp((power - resistance) / 260 + 0.02, 0.01, 0.12);
  state.stats_meta.eliminationAttempts = (state.stats_meta.eliminationAttempts || 0) + 1;

  if (Math.random() < chance){
    target.status = 'disparu';
    getRel(state, target.id).type = 'inconnu';
    state.stats_meta.eliminations = (state.stats_meta.eliminations || 0) + 1;
    bumpStyle(state, 'manipulateur', 15);
    // Même en cas de "réussite", le doute laisse une trace durable — même un plan parfait n'efface pas les rumeurs.
    state.player.stats.reputation = clamp(state.player.stats.reputation - rndInt(8, 18), 0, 100);
    const txt = perfectBuild
      ? `Rien n'est laissé au hasard : chaque détail a été anticipé. ${target.fullName} disparaît dans des circonstances qui ne seront jamais élucidées — votre maîtrise absolue de la situation ne vous a laissé aucune marge d'erreur.`
      : `${target.fullName} disparaît dans des circonstances qui ne seront jamais élucidées. L'école organise une cérémonie discrète, puis tout le monde passe à autre chose — sauf vous, qui savez.`;
    addJournalEntry(state, txt, 'majeur');
    return { outcome:'success', text: txt };
  }

  // Échec (de très loin le cas le plus fréquent) : fin de partie immédiate et définitive.
  state.gameOver = true;
  state.player.flags.expelled = true;
  state.player.flags.arrested = true;
  const txt = `Tout s'effondre. Les preuves remontent jusqu'à vous en quelques jours à peine : ce n'est plus l'administration de LNHS qui s'occupe de votre cas, mais les autorités. Votre parcours s'arrête ici, dans les pires conditions imaginables.`;
  addJournalEntry(state, txt, 'majeur');
  return { outcome:'catastrophic', text: txt };
}


/* ================================================================
   5bis. LA WHITE ROOM — UN(E) ÉLÈVE D'ÉLITE INFILTRÉ(E)
   ------------------------------------------------------------
   Petite chance, à la création de la partie, qu'un(e) camarade de
   votre propre classe (1-D) soit en réalité issu(e) d'un programme
   d'entraînement d'élite occulte. En apparence quelconque — ses
   statistiques visibles sont volontairement basses — il/elle cache
   des aptitudes réelles écrasantes (state.whiteRoom + npc.whiteRoomTrueStats).
   Tant que vous restez discret(e) et médiocre, il/elle vous ignore.
   Mais dès que vous devenez influent(e) ou fort(e), son attention se
   réveille : il/elle se met à vous observer, puis à saboter
   discrètement votre ascension. Il est possible de le/la démasquer
   par l'enquête, puis de le/la confronter directement.
   ================================================================ */

const WHITE_ROOM_SPAWN_CHANCE = 0.25;

/** Initialise (ou réinitialise défensivement) l'état de la White Room pour une sauvegarde. */
function ensureWhiteRoomState(state){
  if (!state.whiteRoom){
    state.whiteRoom = { active:false, npcId:null, stage:'none', attention:0, clues:0, sabotageCount:0 };
  }
  return state.whiteRoom;
}

/** Tenté une seule fois à la création de partie : désigne éventuellement un(e) élève infiltré(e). */
function maybeSpawnWhiteRoomStudent(state){
  const wr = ensureWhiteRoomState(state);
  if (Math.random() >= WHITE_ROOM_SPAWN_CHANCE) return;
  const pool = state.npcs.filter(n => n.classId === 'D' && n.status === 'actif');
  if (!pool.length) return;
  const mole = pick(pool);

  // Statistiques réelles écrasantes, tenues secrètes tant que le/la mole n'est pas démasqué(e).
  mole.whiteRoomTrueStats = {};
  STAT_KEYS.forEach(k => { mole.whiteRoomTrueStats[k] = rndInt(84, 99); });

  // Statistiques visibles délibérément quelconques : le/la mole se fond dans la masse d'une classe D.
  STAT_KEYS.forEach(k => { mole.stats[k] = rndInt(12, 32); });

  wr.active = true;
  wr.npcId = mole.id;
  wr.stage = 'hidden';
  wr.attention = 0;
  wr.clues = 0;
  wr.sabotageCount = 0;
}

function getWhiteRoomNpc(state){
  const wr = ensureWhiteRoomState(state);
  if (!wr.active || !wr.npcId) return null;
  return getNpc(state, wr.npcId) || null;
}

/** Estimation globale de la puissance / visibilité actuelle du joueur, utilisée pour réveiller l'intérêt du mole. */
function computePlayerPower(state){
  const s = state.player.stats;
  const avgStat = STAT_KEYS.reduce((sum,k) => sum + s[k], 0) / STAT_KEYS.length;
  const classBonus = { A:25, B:15, C:7, D:0 }[state.player.classId] || 0;
  return avgStat + classBonus + s.reputation * 0.15 + s.influence * 0.15 + s.popularite * 0.1;
}

const WHITE_ROOM_HIDDEN_HINTS = [
  "Un sentiment étrange vous saisit cette semaine : l'impression fugace d'être observé(e), sans pouvoir dire par qui.",
  "Vous croisez un regard, l'espace d'une seconde, qui semble vous évaluer plus qu'il ne vous voit. Puis plus rien.",
  "Quelque chose cloche dans l'attitude d'un(e) camarade habituellement transparent(e) — une lueur trop calculatrice pour être innocente."
];
const WHITE_ROOM_WATCHING_HINTS = [
  "Vous avez la certitude, cette semaine encore, qu'on prend note du moindre de vos progrès.",
  "Une information que vous pensiez confidentielle semble avoir fuité sans que vous compreniez comment.",
  "Un détail minuscule dans votre emploi du temps a changé sans explication. Une coïncidence, sans doute. Sans doute."
];
const WHITE_ROOM_SABOTAGE_HINTS = [
  "Des obstacles mystérieusement bien synchronisés se dressent sur votre chemin cette semaine.",
  "Quelqu'un, quelque part, semble s'amuser à corriger discrètement votre trajectoire à la baisse.",
  "Vous ne pouvez pas le prouver, mais tout indique qu'une main invisible a rééquilibré la partie en sa faveur."
];

/**
 * Mise à jour hebdomadaire de la surveillance du mole de la White Room.
 * Appelée depuis Game.advanceWeek(). Retourne un texte d'alerte (ou null)
 * destiné à un toast, et journalise systématiquement les étapes clés.
 */
function updateWhiteRoomWatch(state){
  const wr = ensureWhiteRoomState(state);
  if (!wr.active) return null;
  const mole = getNpc(state, wr.npcId);
  if (!mole || mole.status !== 'actif'){ wr.active = false; return null; }

  const power = computePlayerPower(state);

  if (wr.stage === 'hidden'){
    if (power > 40 && Math.random() < 0.10 + clamp((power - 40) / 180, 0, 0.25)){
      wr.stage = 'watching';
      const txt = pick(WHITE_ROOM_HIDDEN_HINTS);
      addJournalEntry(state, txt, 'mystere');
      return txt;
    }
    return null;
  }

  if (wr.stage === 'watching'){
    wr.attention = clamp(wr.attention + rndInt(2, 6) + (power > 55 ? 4 : 0), 0, 100);
    if (wr.attention >= 55 && Math.random() < 0.25){
      wr.stage = 'sabotage';
      const txt = "Ce n'est plus une simple impression : quelqu'un, dans l'ombre, s'intéresse activement à votre ascension — et n'a rien d'un allié.";
      addJournalEntry(state, txt, 'majeur');
      return txt;
    }
    if (Math.random() < 0.16){
      const txt = pick(WHITE_ROOM_WATCHING_HINTS);
      addJournalEntry(state, txt, 'mystere');
      return txt;
    }
    return null;
  }

  if (wr.stage === 'sabotage' || wr.stage === 'exposed'){
    const named = wr.stage === 'exposed';
    if (Math.random() < 0.30){
      wr.sabotageCount = (wr.sabotageCount || 0) + 1;
      const kind = pick(['exam', 'relation', 'rumor', 'stat']);
      let detail = '';
      if (kind === 'exam'){
        state.player.flags.whiteRoomSabotageNextExam = true;
        detail = "Votre prochain examen semble soudain beaucoup plus glissant que prévu.";
      } else if (kind === 'relation'){
        const allies = Object.entries(state.player.relationships).filter(([,r]) => r.type === 'allié' || r.affinity >= 40);
        if (allies.length){
          const [npcId] = pick(allies);
          adjustRelation(state, npcId, { trust: -12, affinity: -6 });
          const n = getNpc(state, npcId);
          detail = `${n ? n.fullName : 'Un(e) proche'} semble avoir été discrètement monté(e) contre vous.`;
        } else {
          detail = pick(WHITE_ROOM_SABOTAGE_HINTS);
        }
      } else if (kind === 'rumor'){
        addRumor(state, { subjectId:'player', subjectName: state.player.name, valence:'bad', strength: rndInt(35, 55), sourceId: named ? mole.id : null });
        detail = "Une rumeur nuisible à votre sujet commence à circuler, avec une précision suspecte.";
      } else {
        const k = pick(['reputation','influence']);
        state.player.stats[k] = clamp(state.player.stats[k] - rndInt(2, 5), 0, 100);
        detail = "Un dossier administratif vous concernant a mystérieusement pris du retard.";
      }
      const prefix = named ? `${mole.fullName} frappe à nouveau : ` : '';
      const txt = prefix + detail;
      addJournalEntry(state, txt, named ? 'majeur' : 'mystere');
      return txt;
    }
    return null;
  }

  return null; // 'resolved' : le mole a renoncé, plus aucune interférence.
}

/**
 * Tentative d'enquête sur l'observateur invisible. Disponible depuis la vue École.
 * Très difficile par nature (le mole est délibérément hors de portée), mais chaque
 * indice recueilli rapproche le joueur de son identité réelle.
 */
function investigateWhiteRoom(state){
  const wr = ensureWhiteRoomState(state);
  if (!wr.active) return "Vous ne remarquez rien d'anormal dans votre entourage.";
  const mole = getNpc(state, wr.npcId);
  if (!mole) return "Vous ne remarquez rien d'anormal dans votre entourage.";
  if (wr.stage === 'hidden') return "Rien ne justifie encore la moindre inquiétude. Continuez d'avancer.";
  if (wr.stage === 'resolved') return "Quoi qu'il se soit passé, cela semble définitivement terminé.";
  if (wr.stage === 'exposed'){
    return `Vous savez déjà de qui il s'agit : ${mole.fullName}. Rendez-vous dans son dossier élève pour le/la confronter directement.`;
  }

  const trueStats = mole.whiteRoomTrueStats || {};
  const chance = clamp(0.10 + state.player.stats.intelligence/300 + state.player.stats.influence/300 + state.player.stats.chance/260
    - (trueStats.sangFroid || 90)/400, 0.04, 0.4);
  if (Math.random() < chance){
    wr.clues = clamp((wr.clues || 0) + 1, 0, 3);
    if (wr.clues >= 3){
      wr.stage = 'exposed';
      bumpStyle(state, 'strategue', 6);
      const txt = `Toutes les pièces s'assemblent enfin : c'est ${mole.fullName} qui s'intéresse à vous depuis le début. Un dossier élève d'une froideur clinique se dévoile derrière la façade.`;
      addJournalEntry(state, txt, 'majeur');
      return txt;
    }
    const txt = `Un indice concret vous met sur une piste sérieuse (${wr.clues}/3). Quelqu'un, dans votre propre classe, n'est clairement pas ce qu'il/elle prétend être.`;
    addJournalEntry(state, txt, 'mystere');
    return txt;
  }
  if (Math.random() < 0.15){
    state.player.stats.reputation = clamp(state.player.stats.reputation - rndInt(1,3), 0, 100);
    return "Vous fouillez un peu trop ouvertement et attirez une attention indésirable, sans rien apprendre d'utile.";
  }
  return "Vous ne trouvez rien de concluant cette fois-ci. Quelqu'un, quelque part, est extrêmement prudent.";
}

/**
 * Confrontation finale, une fois le mole démasqué : oppose la totalité de vos
 * statistiques à ses aptitudes réelles (bien supérieures par nature). Vaincre
 * force le mole à se retirer définitivement ; un échec permet de retenter plus
 * tard, une fois plus fort(e), mais coûte cher dans l'immédiat.
 */
function confrontWhiteRoom(state){
  const wr = ensureWhiteRoomState(state);
  const mole = getNpc(state, wr.npcId);
  if (!mole || wr.stage !== 'exposed') return { outcome:'invalid', text:`Il n'y a personne à confronter pour l'instant.` };

  const trueStats = mole.whiteRoomTrueStats || {};
  const playerPower = STAT_KEYS.reduce((sum,k) => sum + state.player.stats[k], 0) + state.player.stats.reputation*0.3 + state.player.stats.influence*0.3;
  const molePower = STAT_KEYS.reduce((sum,k) => sum + (trueStats[k]||90), 0) * 0.82;
  const margin = playerPower - molePower + rndInt(-25, 25);

  if (margin > 15){
    wr.stage = 'resolved';
    state.stats_meta.whiteRoomDefeated = 1;
    STAT_KEYS.forEach(k => { state.player.stats[k] = clamp(state.player.stats[k] + 2, 0, 100); });
    state.player.points += 400;
    bumpStyle(state, 'strategue', 10);
    const txt = `Face à vous, ${mole.fullName} finit par lâcher le masque un instant — juste assez pour admettre votre valeur. « Intéressant. » C'est tout ce que vous obtiendrez. Mais l'intérêt disparaît de son regard : vous ne l'intéressez plus. Récompense : +2 dans toutes les statistiques, +400 points.`;
    addJournalEntry(state, txt, 'majeur');
    return { outcome:'victory', text: txt };
  }
  if (margin > -25){
    const txt = `${mole.fullName} se contente d'un sourire indéchiffrable et se détourne sans un mot. Rien n'est réglé : il/elle continuera de vous observer, en attendant que vous soyez enfin à sa hauteur.`;
    addJournalEntry(state, txt, 'majeur');
    return { outcome:'stalemate', text: txt };
  }
  state.player.stats.sangFroid = clamp(state.player.stats.sangFroid - rndInt(8, 15), 0, 100);
  state.player.stats.reputation = clamp(state.player.stats.reputation - rndInt(5, 12), 0, 100);
  const txt = `${mole.fullName} vous démonte méthodiquement, sans jamais élever la voix. Vous ressortez de cet échange avec la certitude glaçante d'avoir sous-estimé votre adversaire. Sang-froid et réputation en chute.`;
  addJournalEntry(state, txt, 'majeur');
  return { outcome:'defeat', text: txt };
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
  },
  {
    id: 'exam_oral',
    type: 'oral',
    name: 'Grand oral devant l\'école',
    icon: '🎤',
    desc: "Une présentation individuelle devant l'ensemble des classes réunies. Le trac est le principal adversaire, bien plus que le sujet lui-même.",
    difficulty: 53,
    strategies: [
      { id:'preparation_rigoureuse', name:'Préparer un discours minutieux', sub:'Fiable si vous maîtrisez le sujet.', weights:{intelligence:0.6, sangFroid:0.3} },
      { id:'charisme_brut', name:'Improviser sur votre charisme naturel', sub:'Spectaculaire si ça passe, catastrophique sinon.', weights:{charisme:0.8, chance:0.3} },
      { id:'coaching_prive', name:'Payer un coaching privé en éloquence', sub:'Coûteux mais fiable.', weights:{charisme:0.4, sangFroid:0.4}, cost:180 }
    ]
  },
  {
    id: 'exam_projet_groupe',
    type: 'projet',
    name: 'Projet de groupe pluridisciplinaire',
    icon: '🧱',
    desc: "Un projet mené sur plusieurs semaines avec un groupe imposé. La cohésion du groupe compte autant que la compétence individuelle.",
    difficulty: 57,
    strategies: [
      { id:'chef_projet', name:'Prendre la direction du projet', sub:'Porte la responsabilité, mais valorise le leadership.', weights:{influence:0.5, intelligence:0.4, sangFroid:0.2} },
      { id:'expertise_technique', name:'Se concentrer sur votre expertise technique', sub:'Fiable, dépend surtout de vous.', weights:{intelligence:0.7, endurance:0.2} },
      { id:'ciment_equipe', name:'Souder le groupe avant tout', sub:'Repose sur vos relations existantes.', weights:{charisme:0.5, endurance:0.2}, relBoost:true }
    ]
  }
];

// Types d'examens dont un échec risque de fracturer durablement la classe en clans.
const CLASS_SPLIT_EXAM_TYPES = ['vote', 'psychologique', 'negociation', 'projet'];

/* ----------------------------------------------------------------
   COMPÉTITION INTER-CLASSES & CLASSEMENT DYNAMIQUE
   Chaque examen oppose les 4 classes : la 1ère gagne des points de
   classe, la 2e une somme modeste, la 3e en perd un peu, la dernière
   en perd davantage. Le classement A > B > C > D est ensuite
   recalculé : si une classe dépasse celle du rang immédiatement
   supérieur ET avec une marge nette (CLASS_SWAP_MARGIN), les deux
   échangent leur lettre (et leurs élèves, dont potentiellement le
   joueur, avec elle) — mais UN SEUL échange de rang est autorisé par
   examen (pas d'effet domino), pour qu'il soit impossible de sauter
   directement de la Classe D à la Classe A en un seul examen : il
   faut désormais gravir les échelons un par un, sur plusieurs
   examens réussis.
   ---------------------------------------------------------------- */

// Barème de points par position finale au classement de l'examen (1er, 2e, 3e, 4e/dernier).
// Volontairement resserré (par rapport à l'ancienne version) pour ralentir la progression.
const CLASS_EXAM_REWARD_BY_RANK = [
  { min: 90,  max: 140 },  // 1ère place
  { min: 15,  max: 45  },  // 2e place
  { min: -55, max: -20 },  // 3e place
  { min: -120, max: -70 }  // dernière place
];

// Marge minimale (en points de classe) que la classe du dessous doit dépasser pour déloger celle du dessus.
// Empêche les échanges de rang sur un simple bruit aléatoire d'un point ou deux.
const CLASS_SWAP_MARGIN = 60;

// Avantage structurel de la lettre de classe elle-même (meilleurs professeurs, moyens, réputation auprès de
// l'administration...), appliqué à CHAQUE examen en plus du niveau réel des élèves qui la composent. Ce bonus
// suit la lettre, pas le groupe d'élèves : dès qu'une classe est promue, elle en profite immédiatement, et dès
// qu'elle est reléguée, elle le perd aussitôt. Plus on monte, plus la classe qu'on affronte au rang suivant a
// elle-même un avantage acquis — la montée est donc volontairement de plus en plus dure à mesure qu'on grimpe.
const CLASS_TIER_EXAM_BOOST = { A: 14, B: 7, C: 3, D: 0 };

/** Force moyenne d'une classe (hors joueur), utilisée pour simuler la performance des 3 classes rivales à un examen. */
function getClassAvgStrength(state, classId){
  const members = state.npcs.filter(n => n.classId === classId && n.status === 'actif');
  if (!members.length) return 40;
  const total = members.reduce((sum, n) => sum + (STAT_KEYS.reduce((s,k) => s + n.stats[k], 0) / STAT_KEYS.length), 0);
  return total / members.length;
}

/** Pénalité appliquée aux résultats collectifs de la classe du joueur lorsqu'elle traverse une tension interne
 *  (classe fracturée en clans après un échec, crise en cours...). Une classe qui se déchire en coulisses obtient
 *  de moins bons résultats d'ensemble, même si le joueur, individuellement, s'en sort bien. Les tensions ne sont
 *  suivies que pour la classe du joueur : les classes rivales ne sont pas simulées à ce niveau de détail. */
function getClassTensionPenalty(state){
  let penalty = 0;
  if (state.crisis) penalty += 14;
  if ((state.player.flags.classDividedWeeksLeft || 0) > 0) penalty += 10;
  return penalty;
}

/** Simule le résultat des 4 classes à un examen donné et distribue les points de classe selon le classement obtenu. */
function resolveInterClassExam(state, exam, playerScore){
  const tensionPenalty = getClassTensionPenalty(state);
  const results = CLASS_IDS.map(cid => {
    const tierBoost = CLASS_TIER_EXAM_BOOST[cid] || 0;
    if (cid === state.player.classId){
      return { classId: cid, score: Math.round(playerScore + tierBoost - tensionPenalty), isPlayerClass: true, tensionPenalty };
    }
    const strength = getClassAvgStrength(state, cid);
    return { classId: cid, score: Math.round(strength + tierBoost + rndInt(-18, 18)), isPlayerClass: false };
  });
  results.sort((a, b) => b.score - a.score);
  results.forEach((r, idx) => {
    const range = CLASS_EXAM_REWARD_BY_RANK[idx];
    const delta = rndInt(range.min, range.max);
    r.rank = idx + 1;
    r.pointsDelta = delta;
    state.classPoints[r.classId] = Math.max(0, state.classPoints[r.classId] + delta);
  });
  const rankChanges = normalizeClassRanking(state);
  return { results, rankChanges, tensionPenalty };
}

/** Réordonne les lettres A/B/C/D selon les points de classe actuels. Contrairement à l'ancienne version,
 *  au maximum UN SEUL échange de rang adjacent est autorisé par examen (pas d'effet domino en cascade), et
 *  il faut que la classe du dessous dépasse celle du dessus d'une marge nette (CLASS_SWAP_MARGIN) pour la
 *  déloger — un simple point d'écart aléatoire ne suffit plus. Résultat : impossible de sauter directement
 *  de la Classe D à la Classe A en un seul examen ; il faut grimper un échelon à la fois, examen après examen.
 *  Retourne la liste des échanges effectués (0 ou 1 élément). */
function normalizeClassRanking(state){
  const changes = [];
  for (let i = 0; i < CLASS_IDS.length - 1; i++){
    const higher = CLASS_IDS[i];      // ex: 'A'
    const lower = CLASS_IDS[i + 1];   // ex: 'B'
    if (state.classPoints[lower] > state.classPoints[higher] + CLASS_SWAP_MARGIN){
      // La classe "lower" a nettement plus de points que la classe "higher" : elles échangent leur lettre.
      const tmpPoints = state.classPoints[higher];
      state.classPoints[higher] = state.classPoints[lower];
      state.classPoints[lower] = tmpPoints;

      state.npcs.forEach(n => {
        if (n.classId === higher) n.classId = lower;
        else if (n.classId === lower) n.classId = higher;
      });

      const playerWasHigher = state.player.classId === higher;
      const playerWasLower = state.player.classId === lower;
      if (playerWasHigher) state.player.classId = lower;
      else if (playerWasLower) state.player.classId = higher;

      // "higher" (ex: 'C') est la meilleure lettre : elle est désormais occupée par le groupe qui vient de dépasser (promotion).
      // "lower" (ex: 'D') est la moins bonne lettre : elle est désormais occupée par le groupe dépassé (relégation).
      changes.push({ promotedClassId: higher, demotedClassId: lower, playerAffected: playerWasHigher || playerWasLower, playerNewClassId: playerWasHigher ? lower : (playerWasLower ? higher : null) });
      break; // un seul échange de rang par examen : pas de cascade D -> A en un coup
    }
  }
  return changes;
}

/** Construit le texte du journal + les toasts pour un échange de rang, y compris la notification spécifique au joueur.
 *  ch.promotedClassId est la lettre "haute" (ex: 'B') désormais occupée par le groupe qui vient de dépasser l'autre.
 *  ch.demotedClassId est la lettre "basse" (ex: 'C') désormais occupée par le groupe repoussé. */
function announceRankChanges(state, changes){
  changes.forEach(ch => {
    const txt = `Classement des classes : un groupe dépasse l'autre et devient la Classe ${ch.promotedClassId}, tandis que l'ancienne Classe ${ch.promotedClassId} redescend en Classe ${ch.demotedClassId}.`;
    addJournalEntry(state, txt, 'majeur');
    if (!ch.playerAffected) return;
    const upgraded = ch.playerNewClassId === ch.promotedClassId;
    toast(
      upgraded
        ? `Votre classe vient d'être promue en Classe ${ch.playerNewClassId} !`
        : `Votre classe redescend en Classe ${ch.playerNewClassId}.`,
      upgraded ? 'good' : 'bad'
    );
    addJournalEntry(
      state,
      upgraded
        ? `Votre classe dépasse ses rivales et devient la Classe ${ch.playerNewClassId} !`
        : `Votre classe se fait dépasser et redescend en Classe ${ch.playerNewClassId}.`,
      'majeur'
    );
  });
}

let currentExamContext = null; // stocke l'examen en cours de résolution (modale)

/* ----------------------------------------------------------------
   DOSSIER DE TRANSFERT DE CLASSE
   En dehors de la compétition inter-classes des examens, le joueur
   peut tenter de monter d'un cran en déposant un dossier de
   transfert individuel vers la classe immédiatement au-dessus de la
   sienne. Contrairement à une promotion collective (qui déplace
   toute la classe), ce transfert ne concerne QUE le joueur : ses
   camarades et les points de classe ne bougent pas. Quatre
   conditions cumulatives sont nécessaires :
     1. De bons résultats récents (moyenne des notes finales des 3
        derniers examens).
     2. De bonnes relations avec des élèves de la classe visée.
     3. 5000 points personnels (le coût du dossier).
     4. Un dossier compromettant COMPLET (3/3) sur un professeur,
        encore inexploité, utilisé ici pour faire pression plutôt
        que pour le faire renvoyer — cela consomme le dossier.
   Même une fois les 4 conditions réunies, la pression exercée sur
   le professeur peut échouer (son intégrité peut résister au
   chantage), avec des conséquences pour le joueur.
   ---------------------------------------------------------------- */
const CLASS_TRANSFER_COST = 5000;
const CLASS_TRANSFER_MIN_AVG_NOTE = 13;
const CLASS_TRANSFER_MIN_RELATIONS = 2;
const CLASS_TRANSFER_MIN_AVG_AFFINITY = 30;

/** Calcule où en est le joueur par rapport aux 4 conditions du dossier de transfert (sans rien modifier). */
function getClassTransferStatus(state){
  const currentIdx = CLASS_IDS.indexOf(state.player.classId);
  if (currentIdx <= 0) return { possible:false, alreadyTop:true };

  const targetClassId = CLASS_IDS[currentIdx - 1];

  const recentExams = state.player.examHistory.slice(-3);
  const avgNote = recentExams.length
    ? recentExams.reduce((sum, h) => sum + (h.finalNote !== undefined ? h.finalNote : ({critique:18,reussite:13,partiel:8,echec:3}[h.tier] || 0)), 0) / recentExams.length
    : 0;
  const gradesOk = recentExams.length >= 2 && avgNote >= CLASS_TRANSFER_MIN_AVG_NOTE;

  const targetRelations = Object.entries(state.player.relationships)
    .map(([npcId, rel]) => ({ npc: getNpc(state, npcId), rel }))
    .filter(x => x.npc && x.npc.status === 'actif' && x.npc.classId === targetClassId && x.rel.type !== 'inconnu');
  const avgAffinity = targetRelations.length
    ? targetRelations.reduce((s, x) => s + x.rel.affinity, 0) / targetRelations.length
    : 0;
  const relationsOk = targetRelations.length >= CLASS_TRANSFER_MIN_RELATIONS && avgAffinity >= CLASS_TRANSFER_MIN_AVG_AFFINITY;

  const pointsOk = state.player.points >= CLASS_TRANSFER_COST;

  const availableTeacherIds = TEACHERS
    .map(t => t.id)
    .filter(tid => { const d = getTeacherDossier(state, tid); return d.status === 'actif' && d.evidence >= 3; });
  const teacherOk = availableTeacherIds.length > 0;

  return {
    possible: true, alreadyTop: false, targetClassId,
    gradesOk, avgNote, recentExamsCount: recentExams.length,
    relationsOk, avgAffinity, relationsCount: targetRelations.length,
    pointsOk,
    teacherOk, availableTeacherIds,
    allOk: gradesOk && relationsOk && pointsOk && teacherOk
  };
}

/** Dépose le dossier : consomme les 5000 points et le dossier compromettant choisi, puis tente de faire
 *  céder le professeur sous la pression. En cas de succès, le joueur (lui seul) rejoint la classe visée. */
function submitClassTransferRequest(state, teacherId){
  const status = getClassTransferStatus(state);
  if (!status.possible || !status.allOk) return { success:false, text:`Le dossier n'est pas encore assez solide pour être déposé.` };
  const teacher = getTeacher(teacherId);
  const dossier = getTeacherDossier(state, teacherId);
  if (!teacher || dossier.status !== 'actif' || dossier.evidence < 3) return { success:false, text:`Vous n'avez pas de dossier compromettant exploitable sur ce professeur.` };

  state.player.points = Math.max(0, state.player.points - CLASS_TRANSFER_COST);
  dossier.evidence = 0;

  const targetClassId = status.targetClassId;
  const pressureChance = clamp(0.55 + state.player.stats.influence/300 + state.player.stats.charisme/350 - teacher.integrite/250, 0.3, 0.9);

  if (Math.random() < pressureChance){
    dossier.status = 'corrompu';
    const fromClassId = state.player.classId;
    state.player.classId = targetClassId;
    bumpStyle(state, 'manipulateur', 8);
    const txt = `Sous la pression d'un dossier compromettant, ${teacher.name} appuie discrètement votre demande de transfert auprès du conseil de classe. Vous quittez la Classe ${fromClassId} pour la Classe ${targetClassId}.`;
    addJournalEntry(state, txt, 'majeur');
    return { success:true, text:txt };
  }

  dossier.status = 'echec';
  state.player.stats.reputation = clamp(state.player.stats.reputation - rndInt(10, 20), 0, 100);
  const txt = `${teacher.name} résiste au chantage et menace de tout révéler si vous insistez. Votre dossier est brûlé, vos 5000 points envolés, et votre réputation en pâtit lourdement.`;
  addJournalEntry(state, txt, 'majeur');
  return { success:false, text:txt };
}

/** Calcule le score final d'une stratégie et détermine le palier de réussite.
 *  extraModifier : bonus/malus cumulé pendant le déroulé de l'épreuve (voir EXAM_MOMENT_POOL). */
function resolveExamStrategy(state, exam, strategy, extraModifier){
  let score = 0;
  Object.entries(strategy.weights).forEach(([stat, w]) => {
    score += state.player.stats[stat] * w;
  });
  // bonus de spécialité : s'applique si AU MOINS une des stats pondérées par la
  // stratégie correspond à la spécialité du joueur (auparavant, seule la toute
  // première stat de la stratégie était vérifiée, ce qui privait injustement
  // certaines stratégies pourtant alignées avec la spécialité de leur bonus).
  const specialty = SPECIALTIES.find(s => s.id === state.player.specialtyId);
  if (specialty && Object.keys(strategy.weights).some(k => specialty.bonus[k])) score += 6;

  // bonus relationnel (utile si la stratégie s'appuie sur le groupe)
  if (strategy.relBoost){
    const classmates = Object.values(state.player.relationships);
    const avgAff = classmates.length ? classmates.reduce((s,r)=>s+r.affinity,0)/classmates.length : 0;
    score += avgAff * 0.25;
  }

  // chance influe toujours un peu + aléa
  score += state.player.stats.chance * 0.15;
  score += rndInt(-16, 16);

  // décisions prises pendant le déroulé de l'épreuve (voir runExamMoments)
  score += (extraModifier || 0);

  // sabotage furtif de la White Room, s'il a été déclenché la semaine précédente
  if (state.player.flags.whiteRoomSabotageNextExam){
    score -= rndInt(14, 24);
    state.player.flags.whiteRoomSabotageNextExam = false;
  }

  const diff = exam.difficulty;
  let tier;
  if (score >= diff + 22) tier = 'critique';
  else if (score >= diff + 4) tier = 'reussite';
  else if (score >= diff - 16) tier = 'partiel';
  else tier = 'echec';

  return { score: Math.round(score), tier };
}

/* ----------------------------------------------------------------
   Moments d'épreuve : entre le choix de stratégie et le verdict,
   le joueur traverse 2 péripéties tirées au hasard dans ce pool.
   Chaque choix modifie le score final et peut avoir des conséquences
   annexes (relations, réputation). Rend l'examen interactif plutôt
   qu'un résultat déterminé en un seul clic.
   ---------------------------------------------------------------- */
const EXAM_MOMENT_POOL = [
  {
    id: 'time_pressure',
    icon: '⏳',
    title: 'Le temps presse',
    text(state, exam){ return `Vous abordez la partie la plus exigeante de « ${exam.name} » et sentez le temps filer.`; },
    choices: [
      { label: 'Prendre le temps de bien faire', sub: 'Plus lent, mais plus fiable.',
        effect(state){ return { delta: Math.round(state.player.stats.sangFroid * 0.14), note: null }; } },
      { label: 'Accélérer, quitte à bâcler', sub: 'Rapide — mais le résultat est incertain.',
        effect(state){ return { delta: rndInt(-14, 20), note: null }; } }
    ]
  },
  {
    id: 'provocation',
    icon: '😏',
    title: 'Une provocation',
    text(state, exam){
      const rival = pick(state.npcs.filter(n => n.status === 'actif')) || null;
      this._rival = rival;
      return rival ? `${rival.fullName} glisse une remarque bien sentie pour vous déconcentrer.` : `Un camarade tente de vous déconcentrer par une remarque bien sentie.`;
    },
    choices: [
      { label: "Garder son sang-froid, l'ignorer", sub: 'Sûr, mais sans éclat.',
        effect(state){ return { delta: Math.round(state.player.stats.sangFroid * 0.1), note: null }; } },
      { label: 'Répliquer sèchement', sub: 'Peut vous requinquer... ou vous coûter cher.',
        effect(state, exam, strategy, momentDef){
          const rival = momentDef._rival;
          const success = Math.random() < 0.5 + state.player.stats.charisme / 300;
          if (success){
            return { delta: rndInt(6, 16), note: null };
          }
          if (rival){
            adjustRelation(state, rival.id, { affinity: -10 });
            return { delta: rndInt(-14, -4), note: `${rival.fullName} n'a pas apprécié votre réplique.` };
          }
          return { delta: rndInt(-14, -4), note: null };
        } }
    ]
  },
  {
    id: 'shortcut',
    icon: '🎲',
    title: 'Une occasion douteuse',
    text(state, exam){ return `Un raccourci s'offre à vous — pas vraiment réglementaire, mais tentant.`; },
    choices: [
      { label: 'Résister à la tentation', sub: 'Sans risque pour votre réputation.',
        effect(state){ return { delta: rndInt(0, 6), note: null }; } },
      { label: 'En profiter discrètement', sub: "Gain probable, mais risque d'être repéré.",
        effect(state){
          const caught = Math.random() < 0.22;
          if (caught){
            state.player.stats.reputation = clamp(state.player.stats.reputation - rndInt(4, 9), 0, 100);
            return { delta: rndInt(-6, 4), note: 'Votre petit arrangement a été à moitié repéré : réputation entamée.' };
          }
          return { delta: Math.round(state.player.stats.influence * 0.12) + rndInt(2, 8), note: null };
        } }
    ]
  },
  {
    id: 'classmate_in_need',
    icon: '🤲',
    title: 'Un camarade en difficulté',
    text(state, exam){
      const helped = pick(state.npcs.filter(n => n.status === 'actif')) || null;
      this._helped = helped;
      return helped ? `${helped.fullName}, visiblement perdu(e), vous demande discrètement un coup de main.` : `Un camarade visiblement perdu vous demande discrètement un coup de main.`;
    },
    choices: [
      { label: "L'aider malgré le risque", sub: 'Coûte un peu de temps, mais renforce le lien.',
        effect(state, exam, strategy, momentDef){
          const helped = momentDef._helped;
          if (helped) adjustRelation(state, helped.id, { affinity: 6, trust: 5 });
          return { delta: rndInt(-8, -2), note: helped ? `${helped.fullName} n'oubliera pas votre aide.` : null };
        } },
      { label: 'Rester concentré sur vous-même', sub: 'Égoïste, mais efficace.',
        effect(state){ return { delta: rndInt(2, 8), note: null }; } }
    ]
  },
  {
    id: 'doubt',
    icon: '🌀',
    title: "Le doute s'installe",
    text(state, exam){ return `Un doute soudain vous assaille sur la direction à prendre.`; },
    choices: [
      { label: 'Faire confiance à votre préparation', sub: 'Repose sur votre stratégie initiale.',
        effect(state, exam, strategy){
          const firstStat = Object.keys(strategy.weights)[0];
          return { delta: Math.round((state.player.stats[firstStat] || 0) * 0.1), note: null };
        } },
      { label: "Changer d'avis au dernier moment", sub: 'Un pari, tout simplement.',
        effect(state){ return { delta: rndInt(-16, 22), note: null }; } }
    ]
  },
  {
    id: 'fatigue',
    icon: '🔋',
    title: 'La fatigue pèse',
    text(state, exam){ return `L'effort se prolonge et la fatigue commence à se faire sentir.`; },
    choices: [
      { label: "Puiser dans vos réserves d'endurance", sub: 'Dépend de votre forme physique.',
        effect(state){ return { delta: Math.round(state.player.stats.endurance * 0.13), note: null }; } },
      { label: 'Lever le pied, économiser vos forces', sub: 'Petit gain sûr.',
        effect(state){ return { delta: rndInt(1, 5), note: null }; } }
    ]
  }
];

/** Tire 2 moments distincts du pool pour une épreuve donnée. */
function drawExamMoments(){
  const pool = [...EXAM_MOMENT_POOL];
  const picked = [];
  for (let i = 0; i < 2 && pool.length; i++){
    const idx = rndInt(0, pool.length - 1);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}

/* ----------------------------------------------------------------
   NOTE INDIVIDUELLE & NOTE DE CLASSE
   Depuis cette version, le verdict d'un examen n'est plus déterminé
   uniquement par la prestation personnelle du joueur : il résulte
   de la combinaison d'une note individuelle (sur 20, reflétant le
   palier obtenu par le joueur) et d'une note de classe (sur 20,
   reflétant le rang obtenu par sa classe à ce même examen). Un peu
   de hasard (±2) est appliqué à chacune. Conséquence assumée : il
   est possible — avec malchance, et sans que ce soit la norme —
   d'être individuellement très bon et de rater quand même l'examen
   à cause d'une classe qui s'est fait distancer, tout comme une
   classe qui cartonne peut repêcher une prestation personnelle
   moyenne.
   ---------------------------------------------------------------- */
const INDIVIDUAL_TIER_BASE_NOTE = { critique: 17, reussite: 12, partiel: 7, echec: 3 };
const CLASS_RANK_BASE_NOTE = { 1: 17, 2: 12, 3: 7, 4: 3 };

function getIndividualExamNote(tier){
  return clamp(INDIVIDUAL_TIER_BASE_NOTE[tier] + rndInt(-3, 3), 0, 20);
}
function getClassExamNote(rank){
  return clamp(CLASS_RANK_BASE_NOTE[rank] + rndInt(-3, 3), 0, 20);
}
/** Combine note individuelle et note de classe (pondération 55/45) en une note finale sur 20 et un palier. */
function combineExamNotes(individualNote, classNote){
  const finalNote = Math.round((individualNote * 0.55 + classNote * 0.45) * 10) / 10;
  let tier;
  if (finalNote >= 16) tier = 'critique';
  else if (finalNote >= 11) tier = 'reussite';
  else if (finalNote >= 6) tier = 'partiel';
  else tier = 'echec';
  return { finalNote, tier };
}

/** Applique les conséquences d'un examen selon le palier final obtenu (note individuelle + note de classe combinées). */
function applyExamOutcome(state, exam, strategy, result){
  // Les 4 classes s'affrontent à chaque examen : classement, points de classe et
  // rééquilibrage (limité) des lettres A/B/C/D en fonction du nouveau total.
  const interClass = resolveInterClassExam(state, exam, result.score);

  // Note individuelle (palier personnel) + note de classe (rang de la classe à CET examen), combinées.
  const playerRank = interClass.results.find(r => r.isPlayerClass).rank;
  const individualNote = getIndividualExamNote(result.tier);
  const classNote = getClassExamNote(playerRank);
  const combined = combineExamNotes(individualNote, classNote);
  const finalTier = combined.tier;

  announceRankChanges(state, interClass.rankChanges);

  const tierData = {
    critique: { pointsMult: 2.2, statGain: 3, repDelta: 6, label: 'Réussite critique' },
    reussite: { pointsMult: 1.2, statGain: 2, repDelta: 3, label: 'Réussite' },
    partiel:  { pointsMult: 0.4, statGain: 1, repDelta: 0, label: 'Résultat mitigé' },
    echec:    { pointsMult: -0.8, statGain: 0, repDelta: -5, label: 'Échec' }
  }[finalTier];

  const basePoints = 260;
  const pointsDelta = Math.round(basePoints * tierData.pointsMult);
  state.player.points = Math.max(0, state.player.points + pointsDelta);

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
  if (strategy.relBoost && finalTier !== 'echec'){
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
  const txt = `${exam.name} — ${tierData.label} (stratégie : ${strategy.name}). Note individuelle : ${individualNote}/20, note de classe (${playerRank}${playerRank===1?'ère':'e'} place) : ${classNote}/20, note finale : ${combined.finalNote}/20. Points personnels : ${pointsDelta >= 0 ? '+' : ''}${pointsDelta}.${extraText}`;
  addJournalEntry(state, txt, 'exam');
  state.player.examHistory.push({
    examId: exam.id,
    tier: finalTier,
    individualTier: result.tier,
    classRank: playerRank,
    individualNote,
    classNote,
    finalNote: combined.finalNote,
    week: state.time.week,
    year: state.time.year
  });

  // Les enjeux (expulsion, fracture de classe, crise...) réagissent désormais au verdict FINAL
  // (note individuelle + note de classe combinées), pas seulement à la prestation personnelle brute.
  const stakes = applyExamStakes(state, exam, { score: result.score, tier: finalTier });

  return { tierData, pointsDelta, extraText, stakes, interClass, individualNote, classNote, finalNote: combined.finalNote, finalTier, playerRank };
}

/**
 * Enjeux réels d'un examen raté : au-delà de la perte de points (réversible),
 * un échec peut désormais expulser un(e) camarade (ou, dans les cas les plus
 * graves, le joueur lui-même), fracturer durablement la classe en clans, ou
 * déclencher une crise dont les effets se prolongent sur plusieurs semaines.
 */
function applyExamStakes(state, exam, result){
  const stakes = { expelledNpc: null, playerExpelled: false, classSplit: false, crisisTriggered: false, text: '' };

  state.player.consecutiveExamFails = (result.tier === 'echec')
    ? (state.player.consecutiveExamFails || 0) + 1
    : 0;

  if (result.tier !== 'echec') return stakes;

  const fails = state.player.consecutiveExamFails;
  const severe = result.score <= exam.difficulty - 28;
  const classInDanger = state.classPoints[state.player.classId] < 250;

  // -- Risque d'expulsion : un(e) camarade en général, le joueur seulement dans une
  // situation vraiment désespérée (quasi aucun point, réputation au plus bas,
  // et plusieurs échecs consécutifs) — et même là, ça reste loin d'être automatique.
  const expulsionChance = 0.06 + (severe ? 0.08 : 0) + (fails >= 2 ? 0.10 : 0) + (classInDanger ? 0.06 : 0);
  if (Math.random() < expulsionChance){
    const playerAtRisk = state.player.points < 60 && state.player.stats.reputation < 8 && fails >= 3;
    if (playerAtRisk && Math.random() < 0.12){
      state.gameOver = true;
      state.player.flags.expelled = true;
      stakes.playerExpelled = true;
      const expulsionTxt = `Convoqué(e) par l'administration après une nouvelle défaillance, votre dossier est jugé irrécupérable : vous êtes expulsé(e) de LNHS.`;
      addJournalEntry(state, expulsionTxt, 'majeur');
      stakes.text = expulsionTxt;
      return stakes;
    }
    const pool = state.npcs.filter(n => n.status === 'actif' && n.classId === state.player.classId);
    if (pool.length){
      const target = weightedChoice(pool.map(n => [n, Math.max(1, 40 - n.stats.reputation)]));
      target.status = 'expulse';
      getRel(state, target.id).type = 'inconnu';
      const npcTxt = `Conséquence directe de l'échec : ${target.fullName} est expulsé(e) de LNHS. Sa place vide rappelle à toute la classe que rien n'est jamais acquis.`;
      addJournalEntry(state, npcTxt, 'majeur');
      stakes.expelledNpc = target;
      stakes.text = npcTxt;
    }
  }

  // -- Scission de la classe en clans, sur les examens à forte charge collective --
  if (!stakes.playerExpelled && !stakes.expelledNpc && CLASS_SPLIT_EXAM_TYPES.includes(exam.type)
      && Math.random() < (0.18 + (fails >= 2 ? 0.12 : 0))){
    const classmates = state.npcs.filter(n => n.status === 'actif' && n.classId === state.player.classId);
    const affected = pickN(classmates, Math.min(classmates.length, rndInt(3, 6)));
    affected.forEach(n => {
      n.opinionOfPlayer = clamp(n.opinionOfPlayer - rndInt(10, 25), -100, 100);
      adjustRelation(state, n.id, { affinity: -rndInt(10, 20), trust: -rndInt(5, 15) });
    });
    state.player.flags.classDividedWeeksLeft = 6;
    const splitTxt = `La classe se fracture en clans après ce résultat désastreux : ${affected.length} camarades vous en tiennent publiquement responsable.`;
    addJournalEntry(state, splitTxt, 'majeur');
    stakes.classSplit = true;
    stakes.text += (stakes.text ? ' ' : '') + splitTxt;
  }

  // -- Crise durable, sur un échec particulièrement cuisant --
  if (!stakes.playerExpelled && severe && !state.crisis && Math.random() < 0.35){
    startCrisisArc(state, 'exam_fallout', { examName: exam.name });
    const crisisTxt = `Les retombées de cet échec pèsent lourdement sur l'ambiance de la classe pour les semaines à venir.`;
    addJournalEntry(state, crisisTxt, 'majeur');
    stakes.crisisTriggered = true;
    stakes.text += (stakes.text ? ' ' : '') + crisisTxt;
  }

  return stakes;
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
    // Nécessite désormais une relation déjà proche (seuil "ami proche") et exclut
    // explicitement toute relation hostile — la romance doit se mériter, pas
    // tomber sur un simple coup de dé faiblement corrélé à l'affinité.
    requires(state, npc){
      const rel = getRel(state, npc.id);
      return rel.affinity >= 60 && rel.type !== 'ennemi' && rel.type !== 'rival';
    },
    choices: [
      { label:'Tenter un rapprochement', sub:'Peut mener à une romance', apply(state, npc){
          const rel = getRel(state, npc.id);
          // La chance dépend fortement de l'affinité au-delà du seuil de 60 :
          // à peine franchi, elle reste modeste ; proche de 100, elle devient quasi sûre.
          const chance = clamp(0.15 + (rel.affinity - 60)/70 + state.player.stats.charisme/300, 0.1, 0.9);
          if (Math.random() < chance){
            rel.type = 'romance';
            rel.affinity = clamp(rel.affinity + 15, -100, 100);
            const activeCount = getActiveRomances(state).length;
            state.stats_meta.maxConcurrentRomances = Math.max(state.stats_meta.maxConcurrentRomances || 0, activeCount);
            if (activeCount > 1){
              if (!state.player.flags.relationshipStyle){
                state.player.flags.relationshipStyle = 'libre';
                bumpStyle(state, 'manipulateur', 2);
                return `Un lien nouveau se crée avec ${npc.fullName}. Vous menez désormais plusieurs histoires en parallèle — pour l'instant, personne ne sait.`;
              }
              return `Un lien nouveau se crée entre vous et ${npc.fullName}, en plus de vos autres relations.`;
            }
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
    text(state, npc){
      // Fait naître (ou renforce) une rumeur bien réelle et durable sur le joueur.
      const valence = pick(['bad', 'good', 'neutral']);
      addRumor(state, { subjectId: 'player', subjectName: state.player.name, valence, strength: rndInt(35, 55), sourceId: npc.id });
      return `${npc.fullName} vous rapporte qu'une rumeur — plus ou moins flatteuse — circule à votre sujet dans les couloirs.`;
    },
    weight: 7,
    choices: [
      { label:'Démentir publiquement', sub:'+réputation si réussi, coûte du temps', apply(state, npc){
          const chance = clamp(0.35 + state.player.stats.charisme/200, 0.2, 0.8);
          const rumor = state.rumors.find(r => r.subjectId === 'player');
          if (Math.random() < chance){
            state.player.stats.reputation = clamp(state.player.stats.reputation + 3, 0, 100);
            if (rumor) rumor.strength = clamp(rumor.strength - 30, 0, 100);
            return `Votre mise au point convainc la majorité. La rumeur retombe.`;
          }
          state.player.stats.reputation = clamp(state.player.stats.reputation - 2, 0, 100);
          if (rumor) rumor.strength = clamp(rumor.strength + 15, 0, 100);
          return `Votre démenti sonne creux. La rumeur persiste, amplifiée.`;
        }},
      { label:'Laisser courir sans réagir', sub:'Neutre, imprévisible sur la durée', apply(state, npc){
          return `Vous décidez d'ignorer la rumeur. ${npc.fullName} hausse les épaules.`;
        }},
      { label:'Retourner la rumeur à votre avantage', sub:'+influence, risqué', apply(state, npc){
          state.player.stats.influence = clamp(state.player.stats.influence + 3, 0, 100);
          adjustRelation(state, npc.id, { trust: -3 });
          const rumor = state.rumors.find(r => r.subjectId === 'player');
          if (rumor) rumor.valence = 'neutral';
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
  },
  {
    id: 'ev_club_tournament',
    title: 'Tournoi inter-clubs',
    text(state, npc){ const club = getClub(state.player.clubId); return `Votre club (${club ? club.name : 'club'}) affronte celui de ${npc.fullName} lors d'un tournoi ouvert à toute l'école.`; },
    weight: 7,
    requires(state){ return !!state.player.clubId; },
    choices: [
      { label:'Porter l\'équipe sur vos épaules', sub:'Dépend des stats liées à votre club', apply(state, npc){
          const club = getClub(state.player.clubId);
          const keys = club ? Object.keys(club.bonus) : ['charisme'];
          const avg = keys.reduce((sum,k)=>sum+state.player.stats[k],0) / keys.length;
          const chance = clamp(0.3 + avg/140, 0.15, 0.88);
          bumpStyle(state, 'leader', 2);
          if (Math.random() < chance){
            state.player.points += 180;
            state.player.stats.popularite = clamp(state.player.stats.popularite + 3, 0, 100);
            adjustRelation(state, npc.id, { affinity: -3 });
            return `Votre club l'emporte grâce à votre performance. +180 points, Popularité +3.`;
          }
          state.player.stats.reputation = clamp(state.player.stats.reputation - 2, 0, 100);
          return `Le tournoi tourne à l'avantage du club adverse. Réputation -2.`;
        }},
      { label:'Soutenir depuis les gradins', sub:'Neutre, sûr', apply(state, npc){
          adjustRelation(state, npc.id, { affinity: 3 });
          return `Vous encouragez sans prendre de risque. L'ambiance reste bon enfant.`;
        }}
    ]
  },
  {
    id: 'ev_school_festival',
    title: 'Festival de l\'école',
    text(state, npc){ return `L'école organise son festival annuel. ${npc.fullName} vous propose de tenir un stand ensemble.`; },
    weight: 5,
    choices: [
      { label:'Organiser un stand ambitieux', sub:'Investissement risqué, gros gains possibles', apply(state, npc){
          const chance = clamp(0.3 + state.player.stats.charisme/200 + state.player.stats.influence/240, 0.15, 0.85);
          if (Math.random() < chance){
            const gain = rndInt(200, 380);
            state.player.points += gain;
            state.player.stats.popularite = clamp(state.player.stats.popularite + 4, 0, 100);
            adjustRelation(state, npc.id, { affinity: 10, trust: 6 });
            bumpStyle(state, 'leader', 2);
            return `Le stand est un franc succès ! +${gain} points, Popularité +4.`;
          }
          state.player.stats.reputation = clamp(state.player.stats.reputation - 2, 0, 100);
          return `Le stand tourne au fiasco organisationnel. Réputation -2.`;
        }},
      { label:'Profiter du festival tranquillement', sub:'+relation, +popularité modérée', apply(state, npc){
          adjustRelation(state, npc.id, { affinity: 8 });
          state.player.stats.popularite = clamp(state.player.stats.popularite + 1, 0, 100);
          return `Vous passez un bon moment avec ${npc.fullName}, sans prise de risque.`;
        }},
      { label:'Ignorer le festival, réviser', sub:'+intelligence légère', apply(state, npc){
          state.player.stats.intelligence = clamp(state.player.stats.intelligence + 2, 0, 100);
          adjustRelation(state, npc.id, { affinity: -4 });
          return `Vous préférez avancer dans vos révisions. ${npc.fullName} le remarque.`;
        }}
    ]
  },
  {
    id: 'ev_transfer_student',
    title: 'Nouvel élève',
    text(state, npc){ return `${npc.fullName}, récemment transféré(e), semble perdu(e) et cherche des repères dans l'école.`; },
    weight: 4,
    choices: [
      { label:'L\'aider à s\'intégrer', sub:'+forte relation, +réputation légère', apply(state, npc){
          adjustRelation(state, npc.id, { affinity: 16, trust: 12 });
          state.player.stats.reputation = clamp(state.player.stats.reputation + 1, 0, 100);
          rememberNpc(state, npc, `Vous a aidé(e) à trouver vos marques dès votre arrivée.`);
          return `${npc.fullName} vous est reconnaissant(e) de cet accueil chaleureux.`;
        }},
      { label:'L\'observer sans intervenir', sub:'+chance légère, information passive', apply(state, npc){
          state.player.stats.chance = clamp(state.player.stats.chance + 1, 0, 100);
          return `Vous préférez observer avant de vous engager. Prudence oblige.`;
        }}
    ]
  },
  {
    id: 'ev_cheating_witness',
    title: 'Vous surprenez une tricherie',
    text(state, npc){ return `Vous surprenez ${npc.fullName} en train de tricher discrètement lors d'un contrôle mineur.`; },
    weight: 5,
    choices: [
      { label:'Dénoncer aux enseignants', sub:'+réputation, relation détruite', apply(state, npc){
          state.player.stats.reputation = clamp(state.player.stats.reputation + 4, 0, 100);
          adjustRelation(state, npc.id, { affinity: -40, trust: -40, fear: 15 });
          getRel(state, npc.id).type = 'ennemi';
          rememberNpc(state, npc, `Vous a dénoncé(e) pour tricherie auprès des enseignants.`);
          return `Vous rapportez l'incident. ${npc.fullName} ne vous le pardonnera pas.`;
        }},
      { label:'Garder le silence en échange d\'une faveur', sub:'+peur, +influence, base d\'un futur chantage', apply(state, npc){
          adjustRelation(state, npc.id, { fear: 20, trust: -10 });
          state.player.stats.influence = clamp(state.player.stats.influence + 3, 0, 100);
          rememberNpc(state, npc, `Sait que vous l'avez couvert(e) — et pourrait vous le faire payer un jour.`);
          bumpStyle(state, 'manipulateur', 3);
          return `${npc.fullName} vous doit désormais le silence. Une carte à jouer plus tard.`;
        }},
      { label:'Ne rien faire', sub:'Aucun effet', apply(state, npc){
          return `Vous détournez le regard. Ce n'est pas votre affaire.`;
        }}
    ]
  },
  {
    id: 'ev_job_offer',
    title: 'Petit boulot ponctuel',
    text(state, npc){ return `${npc.fullName} vous propose un petit boulot ponctuel, un peu éprouvant mais bien rémunéré.`; },
    weight: 6,
    choices: [
      { label:'Accepter', sub:'+points, -endurance', apply(state, npc){
          const gain = rndInt(90, 220);
          state.player.points += gain;
          state.player.stats.endurance = clamp(state.player.stats.endurance - 2, 0, 100);
          return `Le travail est fatigant mais rentable. +${gain} points, Endurance -2.`;
        }},
      { label:'Refuser, préserver son énergie', sub:'Aucun effet', apply(state, npc){
          return `Vous déclinez poliment. ${npc.fullName} comprend.`;
        }}
    ]
  },
  {
    id: 'ev_lost_item',
    title: 'Objet trouvé',
    text(state, npc){ return `Vous trouvez un objet de valeur appartenant visiblement à ${npc.fullName}, tombé de son sac.`; },
    weight: 6,
    choices: [
      { label:'Le lui rendre', sub:'+relation, +réputation légère', apply(state, npc){
          adjustRelation(state, npc.id, { affinity: 10, trust: 8 });
          state.player.stats.reputation = clamp(state.player.stats.reputation + 1, 0, 100);
          return `${npc.fullName} vous remercie chaleureusement pour votre honnêteté.`;
        }},
      { label:'Le revendre discrètement', sub:'+points, relation dégradée si découvert', apply(state, npc){
          const gain = rndInt(60, 140);
          state.player.points += gain;
          if (Math.random() < 0.4){
            adjustRelation(state, npc.id, { affinity: -20, trust: -15 });
            rememberNpc(state, npc, `Soupçonne que vous avez gardé un objet perdu lui appartenant.`);
            return `Vous revendez l'objet pour ${gain} points... mais ${npc.fullName} commence à avoir des soupçons.`;
          }
          return `Vous revendez discrètement l'objet pour ${gain} points, sans que personne ne remarque rien.`;
        }}
    ]
  },
  {
    id: 'ev_love_rival',
    title: 'Un rival amoureux',
    text(state, npc){
      const targetId = state.player.flags.__loveRivalTarget;
      const target = targetId ? getNpc(state, targetId) : null;
      return `Vous apprenez que ${npc.fullName} s'intéresse de près à ${target ? target.fullName : 'votre partenaire'}, cherchant visiblement à s'immiscer.`;
    },
    weight: 4,
    requires(state){ return getActiveRomances(state).length > 0; },
    pickNpc(state){
      // On tire au sort LAQUELLE de vos romances actives est visée (utile en cas de harem).
      const romances = getActiveRomances(state);
      const romanceId = pick(romances);
      state.player.flags.__loveRivalTarget = romanceId;
      const pool = state.npcs.filter(n => n.id !== romanceId && n.status === 'actif');
      return pool.length ? pick(pool) : null;
    },
    choices: [
      { label:'Affirmer votre lien publiquement', sub:'+relation avec le/la partenaire visé(e), tension avec le rival', apply(state, npc){
          const romanceId = state.player.flags.__loveRivalTarget;
          if (romanceId) adjustRelation(state, romanceId, { affinity: 10, trust: 6 });
          adjustRelation(state, npc.id, { affinity: -12 });
          delete state.player.flags.__loveRivalTarget;
          return `Votre geste ne laisse planer aucun doute. ${npc.fullName} recule, dépité(e).`;
        }},
      { label:'Ignorer la situation, faire confiance', sub:'+sang-froid', apply(state, npc){
          state.player.stats.sangFroid = clamp(state.player.stats.sangFroid + 2, 0, 100);
          delete state.player.flags.__loveRivalTarget;
          return `Vous choisissez de ne pas vous laisser déstabiliser par cette rivalité.`;
        }}
    ]
  },
  {
    id: 'ev_jealousy_confrontation',
    title: 'Le pot aux roses',
    text(state, npc){ return `${npc.fullName} a découvert que vous meniez plusieurs histoires en parallèle. La confrontation est inévitable.`; },
    weight: 5,
    requires(state){ return getActiveRomances(state).length >= 2; },
    pickNpc(state){
      const romances = getActiveRomances(state);
      const chosenId = pick(romances);
      return getNpc(state, chosenId);
    },
    choices: [
      { label:'Assumer ouvertement vivre plusieurs histoires à la fois', sub:'Test de charisme — rupture possible en cas d\'échec', apply(state, npc){
          const chance = clamp(0.25 + state.player.stats.charisme/160 + state.player.stats.sangFroid/300, 0.05, 0.85);
          const rel = getRel(state, npc.id);
          if (Math.random() < chance){
            adjustRelation(state, npc.id, { affinity: 5, trust: -5 });
            state.player.stats.popularite = clamp(state.player.stats.popularite + 3, 0, 100);
            bumpStyle(state, 'leader', 3);
            return `${npc.fullName} accepte, à contrecœur, de partager votre attention. Votre franchise forcée impose un respect ambigu.`;
          }
          rel.type = 'ex';
          rel.affinity = clamp(rel.affinity - 60, -100, 100);
          state.player.stats.reputation = clamp(state.player.stats.reputation - rndInt(4,10), 0, 100);
          rememberNpc(state, npc, `A découvert que vous meniez plusieurs histoires en parallèle et a rompu.`);
          return `${npc.fullName} claque la porte, furieux(se). La rumeur ne tardera pas à courir.`;
        }},
      { label:'Nier et minimiser', sub:'Test de sang-froid — dissimulation risquée', apply(state, npc){
          const chance = clamp(0.2 + state.player.stats.sangFroid/150, 0.05, 0.8);
          const rel = getRel(state, npc.id);
          if (Math.random() < chance){
            return `${npc.fullName}, sceptique, choisit malgré tout de vous croire... pour l'instant.`;
          }
          rel.type = 'ex';
          rel.affinity = clamp(rel.affinity - 70, -100, 100);
          state.player.stats.reputation = clamp(state.player.stats.reputation - rndInt(6,14), 0, 100);
          bumpStyle(state, 'manipulateur', 4);
          rememberNpc(state, npc, `A vu votre mensonge s'effondrer et a rompu, blessé(e).`);
          return `Le mensonge s'effondre aussitôt. ${npc.fullName} se sent trahi(e) et rompt sur-le-champ.`;
        }},
      { label:'Faire un choix clair et rompre avec l\'autre relation', sub:'Évite le scandale, mais un cœur brisé', apply(state, npc){
          adjustRelation(state, npc.id, { affinity: 10, trust: 10 });
          const others = getActiveRomances(state).filter(id => id !== npc.id);
          if (others.length){
            const otherId = pick(others);
            const otherNpc = getNpc(state, otherId);
            const otherRel = getRel(state, otherId);
            otherRel.type = 'ex';
            otherRel.affinity = clamp(otherRel.affinity - 30, -100, 100);
            rememberNpc(state, otherNpc, `A été quitté(e) pour ${npc.fullName}.`);
            return `Vous choisissez ${npc.fullName} et rompez avec ${otherNpc.fullName}. Pas de scandale, mais un cœur brisé.`;
          }
          return `Vous réaffirmez votre engagement envers ${npc.fullName}.`;
        }}
    ]
  },
  {
    id: 'ev_council_duty',
    title: 'Dossier urgent du conseil',
    text(state, npc){ return `En tant que membre du conseil des élèves, on vous confie un dossier délicat impliquant ${npc.fullName}.`; },
    weight: 5,
    requires(state){ return !!state.player.flags.studentCouncil; },
    choices: [
      { label:'Traiter le dossier avec rigueur et impartialité', sub:'+réputation, +influence', apply(state, npc){
          state.player.stats.reputation = clamp(state.player.stats.reputation + 3, 0, 100);
          state.player.stats.influence = clamp(state.player.stats.influence + 2, 0, 100);
          return `Votre gestion rigoureuse du dossier est remarquée par l'administration.`;
        }},
      { label:'Favoriser discrètement vos intérêts', sub:'+points, risque si découvert', apply(state, npc){
          state.player.points += 150;
          bumpStyle(state, 'manipulateur', 3);
          if (Math.random() < 0.35){
            state.player.stats.reputation = clamp(state.player.stats.reputation - 8, 0, 100);
            return `Vous orientez le dossier en votre faveur pour 150 points... mais quelqu'un s'en aperçoit. Réputation -8.`;
          }
          return `Vous orientez discrètement le dossier en votre faveur. +150 points.`;
        }}
    ]
  },
  {
    id: 'ev_business_pitch',
    title: 'Opportunité entrepreneuriale',
    text(state, npc){ return `${npc.fullName} vous propose de co-investir dans un petit trafic toléré (reventes, paris entre élèves) contre une mise de départ.`; },
    weight: 7,
    choices: [
      { label:'Investir 150 points', sub:'Risque/récompense', apply(state, npc){
          if (state.player.points < 150) return `Vous n'avez pas assez de points pour investir.`;
          state.player.points -= 150;
          const chance = clamp(0.4 + state.player.stats.chance/260 + state.player.stats.influence/300, 0.15, 0.85);
          if (Math.random() < chance){
            const gain = rndInt(280, 420);
            state.player.points += gain;
            adjustRelation(state, npc.id, { affinity: 6, trust: 6 });
            bumpStyle(state, 'strategue', 2);
            return `L'investissement rapporte gros : +${gain} points au total.`;
          }
          adjustRelation(state, npc.id, { affinity: -4 });
          return `L'affaire tourne mal. Votre mise de 150 points est perdue.`;
        }},
      { label:'Décliner', sub:'Aucun effet', apply(state, npc){ return `Vous préférez ne pas prendre le risque avec ${npc.fullName}.`; } }
    ]
  },
  {
    id: 'ev_party_invite',
    title: 'Invitation à une soirée',
    text(state, npc){ return `${npc.fullName} organise une soirée discrète en dortoir et vous y invite.`; },
    weight: 9,
    choices: [
      { label:'Y aller et profiter', sub:'+popularité, +charisme, léger risque de fatigue', apply(state, npc){
          state.player.stats.popularite = clamp(state.player.stats.popularite + 3, 0, 100);
          state.player.stats.charisme = clamp(state.player.stats.charisme + 2, 0, 100);
          adjustRelation(state, npc.id, { affinity: 10, trust: 4 });
          if (Math.random() < 0.25){
            state.player.stats.sangFroid = clamp(state.player.stats.sangFroid - 3, 0, 100);
            return `Excellente soirée avec ${npc.fullName}, mais vous êtes un peu fatigué(e) le lendemain. Popularité +3, Charisme +2, Sang-froid -3.`;
          }
          return `Vous passez un excellent moment avec ${npc.fullName}. Popularité +3, Charisme +2.`;
        }},
      { label:'Y aller pour observer et récolter des infos', sub:'+chance de secret, discret', apply(state, npc){
          bumpStyle(state, 'discret', 2);
          const pool = state.npcs.filter(n => !state.player.knownSecrets.includes(n.id) && n.status==='actif');
          if (pool.length && Math.random() < 0.4){
            const t = pick(pool);
            state.player.knownSecrets.push(t.id);
            state.stats_meta.secretsDiscovered++;
            return `En observant plus que vous ne participez, vous surprenez un secret sur ${t.fullName}.`;
          }
          return `Vous observez la soirée sans rien apprendre de particulier cette fois.`;
        }},
      { label:'Refuser poliment', sub:'Aucun effet', apply(state, npc){ adjustRelation(state, npc.id, { affinity: -3 }); return `Vous déclinez. ${npc.fullName} semble un peu déçu(e).`; } }
    ]
  },
  {
    id: 'ev_sports_challenge',
    title: 'Défi sportif',
    text(state, npc){ return `${npc.fullName} vous met au défi lors d'une épreuve physique improvisée devant la classe.`; },
    weight: 6,
    choices: [
      { label:'Relever le défi', sub:'Issue liée à la Force', apply(state, npc){
          const chance = clamp(0.35 + state.player.stats.force/220 + state.player.stats.endurance/300, 0.1, 0.9);
          if (Math.random() < chance){
            state.player.stats.force = clamp(state.player.stats.force + 2, 0, 100);
            state.player.stats.popularite = clamp(state.player.stats.popularite + 3, 0, 100);
            bumpStyle(state, 'combattant', 3);
            adjustRelation(state, npc.id, { affinity: 4, fear: 2 });
            return `Vous dominez ${npc.fullName} sans difficulté. Force +2, Popularité +3.`;
          }
          state.player.stats.reputation = clamp(state.player.stats.reputation - 2, 0, 100);
          adjustRelation(state, npc.id, { affinity: -3 });
          return `${npc.fullName} l'emporte face à vous, sous les rires de la classe. Réputation -2.`;
        }},
      { label:'Décliner avec assurance', sub:'+sang-froid léger', apply(state, npc){
          state.player.stats.sangFroid = clamp(state.player.stats.sangFroid + 1, 0, 100);
          return `Vous ignorez la provocation avec un calme désarmant.`;
        }}
    ]
  },
  {
    id: 'ev_notes_theft',
    title: 'Notes disparues',
    text(state, npc){ return `Vos notes de cours ont disparu juste avant un examen. Une rumeur désigne ${npc.fullName} comme responsable.`; },
    weight: 5,
    choices: [
      { label:'Confronter directement', sub:'Issue liée au Charisme/Sang-froid', apply(state, npc){
          const chance = clamp(0.3 + state.player.stats.charisme/240 + state.player.stats.sangFroid/300, 0.1, 0.85);
          if (Math.random() < chance){
            adjustRelation(state, npc.id, { affinity: -8, fear: 6, trust: -4 });
            state.player.stats.reputation = clamp(state.player.stats.reputation + 1, 0, 100);
            return `${npc.fullName} finit par avouer et vous rend vos notes, penaud(e).`;
          }
          adjustRelation(state, npc.id, { affinity: -6 });
          state.player.stats.intelligence = clamp(state.player.stats.intelligence - 1, 0, 100);
          return `${npc.fullName} nie tout en bloc. L'accusation se retourne contre vous. Intelligence -1 (moins bien préparé).`;
        }},
      { label:'Laisser filer et refaire ses notes', sub:'+sang-froid, perte de temps', apply(state, npc){
          state.player.stats.sangFroid = clamp(state.player.stats.sangFroid + 2, 0, 100);
          state.player.stats.intelligence = clamp(state.player.stats.intelligence - 1, 0, 100);
          return `Vous refaites vos notes sans faire d'esclandre. Sang-froid +2, Intelligence -1.`;
        }}
    ]
  },
  {
    id: 'ev_rumor_about_player',
    title: 'On parle de vous',
    text(state, npc){ return `${npc.fullName} vous prévient qu'une rumeur, vraie ou fausse, commence à circuler à votre sujet.`; },
    weight: 6,
    choices: [
      { label:'Étouffer la rumeur par l\'influence', sub:'Coût en points, efficace', apply(state, npc){
          if (state.player.points < 100) return `Vous n'avez pas assez de points pour agir efficacement.`;
          state.player.points -= 100;
          if (state.rumors) state.rumors = state.rumors.filter(r => r.subjectId !== 'player');
          adjustRelation(state, npc.id, { trust: 4 });
          return `Grâce à quelques faveurs bien placées, la rumeur s'éteint avant de se propager. -100 points.`;
        }},
      { label:'Laisser dire, assumer', sub:'+sang-froid, risque de propagation', apply(state, npc){
          state.player.stats.sangFroid = clamp(state.player.stats.sangFroid + 2, 0, 100);
          addRumor(state, { subjectId:'player', subjectName: state.player.name, valence: Math.random()<0.5?'bad':'good', strength: rndInt(20,40), sourceId: npc.id });
          return `Vous choisissez de ne pas réagir. La rumeur continue de circuler sans que vous ne perdiez votre calme.`;
        }}
    ]
  },
  {
    id: 'ev_mentor_offer',
    title: 'Proposition de mentorat',
    text(state, npc){ return `${npc.fullName}, plus expérimenté(e), vous propose un échange de compétences hebdomadaire.`; },
    weight: 6,
    choices: [
      { label:'Accepter l\'échange', sub:'+2 stats aléatoires, +relation', apply(state, npc){
          const keys = pickN(STAT_KEYS, 2);
          keys.forEach(k => { state.player.stats[k] = clamp(state.player.stats[k] + 2, 0, 100); });
          adjustRelation(state, npc.id, { affinity: 8, trust: 8 });
          return `${npc.fullName} vous transmet quelques méthodes utiles. ${keys.map(k=>STAT_LABELS[k]).join(', ')} +2.`;
        }},
      { label:'Décliner, préférer travailler seul(e)', sub:'+sang-froid léger', apply(state, npc){
          state.player.stats.sangFroid = clamp(state.player.stats.sangFroid + 1, 0, 100);
          bumpStyle(state, 'discret', 1);
          return `Vous préférez avancer à votre rythme, sans dépendre de ${npc.fullName}.`;
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

/* ---------------------------------------------------------------
   Dialogue libre : parler avec un(e) élève, en dehors des actions
   existantes ("passer du temps ensemble" reste inchangé). Chaque
   discussion a un sujet + un ton, avec une vraie issue (réussite /
   neutre / échec) qui dépend de la relation, des stats et parfois de
   l'humeur du PNJ — ce n'est jamais un gain garanti. Le texte affiché
   est composé au moment du clic à partir de banques de répliques par
   sujet x issue, injectées avec les données réelles du PNJ (ambition,
   rumeur en cours, etc.) : peu de lignes à maintenir, une combinatoire
   énorme et toujours contextuelle à l'usage.
   --------------------------------------------------------------- */

function moodTier(npc){
  if (npc.mood >= 65) return 'bonne';
  if (npc.mood <= 35) return 'mauvaise';
  return 'neutre';
}

/** Banques de répliques par sujet, indexées par issue. Chaque entrée est une fonction (npc) => texte. */
const DIALOGUE_LINES = {
  papoter: {
    reussite: [
      n => `${n.fullName} rit à une de vos remarques et enchaîne sur une anecdote de sa semaine.`,
      n => `La conversation glisse naturellement, sans temps mort — ${n.fullName} semble apprécier la compagnie.`,
      n => `${n.fullName} vous pose des questions en retour, visiblement curieux(se) de mieux vous connaître.`,
      n => `Un moment simple et agréable ; ${n.fullName} propose même de recommencer bientôt.`
    ],
    neutre: [
      n => `Vous échangez quelques banalités avec ${n.fullName}, sans plus.`,
      n => `${n.fullName} répond poliment mais reste distrait(e), l'esprit visiblement ailleurs.`,
      n => `La discussion reste courtoise mais un peu convenue.`
    ],
    echec: [
      n => `${n.fullName} écourte la conversation, visiblement peu disponible aujourd'hui.`,
      n => `Vous sentez que ${n.fullName} n'a pas vraiment envie de parler — l'échange tombe à plat.`,
      n => `${n.fullName} répond sèchement et détourne rapidement la conversation.`
    ]
  },
  ambition: {
    reussite: [
      n => `${n.fullName} se confie longuement sur son objectif : « ${n.ambition} ». Le fait que vous vous y intéressiez semble le/la toucher.`,
      n => `En évoquant son ambition, ${n.fullName} baisse sa garde et vous parle avec une sincérité inhabituelle.`,
      n => `${n.fullName} vous remercie d'avoir demandé — peu de gens s'intéressent vraiment à « ${n.ambition} ».`
    ],
    neutre: [
      n => `${n.fullName} évoque son ambition en quelques mots, sans s'étendre davantage.`,
      n => `${n.fullName} reste vague sur ses projets, comme s'il/elle ne voulait pas trop en dire.`
    ],
    echec: [
      n => `${n.fullName} se braque : ce sujet touche visiblement un point sensible.`,
      n => `« Ça ne vous regarde pas vraiment », répond ${n.fullName}, agacé(e) par votre insistance.`
    ]
  },
  rumeur: {
    reussite: [
      n => `${n.fullName} apprécie que vous abordiez la rumeur directement plutôt que d'en parler dans son dos. Le lien s'en trouve renforcé.`,
      n => `Soulagé(e) d'en parler enfin, ${n.fullName} vous livre sa version des faits.`
    ],
    neutre: [
      n => `${n.fullName} balaie la rumeur d'un geste, sans vraiment vouloir en discuter.`
    ],
    echec: [
      n => `${n.fullName} se braque : évoquer la rumeur ravive une blessure encore fraîche.`,
      n => `Mauvaise idée — ${n.fullName} vous soupçonne d'y être pour quelque chose et se referme.`
    ]
  },
  crise: {
    reussite: [
      n => `${n.fullName} semble sincèrement touché(e) que vous preniez de ses nouvelles en cette période tendue.`,
      n => `Prendre le temps de demander comment ${n.fullName} vit la situation actuelle crée un vrai moment de proximité.`
    ],
    neutre: [
      n => `${n.fullName} élude poliment vos questions sur la situation actuelle.`
    ],
    echec: [
      n => `${n.fullName} vous reproche presque d'aborder le sujet — les nerfs sont à vif en ce moment.`
    ]
  },
  sonder: {
    reussite: [
      n => `${n.fullName} laisse échapper un détail révélateur, sans réaliser à quel point il/elle en dit long.`,
      n => `Une phrase de trop de la part de ${n.fullName} vous met sur une piste.`
    ],
    neutre: [
      n => `${n.fullName} reste évasif(ve), sans rien laisser transparaître d'utile.`
    ],
    echec: [
      n => `${n.fullName} sent que vous cherchez quelque chose et se ferme complètement.`
    ]
  }
};

/** Fait progresser discrètement l'enquête sur un secret via des indices accumulés en conversation. */
function markSecretHint(state, npc){
  npc.secretHints = (npc.secretHints || 0) + 1;
  if (npc.secretHints >= 3 && !state.player.knownSecrets.includes(npc.id)){
    state.player.knownSecrets.push(npc.id);
    state.stats_meta.secretsDiscovered++;
    npc.secretHints = 0;
    addJournalEntry(state, `À force d'indices distillés en conversation, vous reconstituez le secret de ${npc.fullName}.`, 'secret');
  }
}

/**
 * Sujets de conversation disponibles. Chaque sujet propose 1 à 2 tons (approches), chacun avec
 * sa propre probabilité de réussite (fonction des stats/relation/traits) et ses propres effets —
 * jamais un gain garanti comme "passer du temps ensemble". `linesKey` pointe vers DIALOGUE_LINES.
 */
const DIALOGUE_TOPICS = [
  {
    id: 'papoter', label: 'Papoter légèrement', linesKey: 'papoter',
    available(){ return true; },
    approaches: [
      { id:'chaleureux', label:'Sur un ton chaleureux', sub:'sûr, gains modestes',
        resolve(state, npc){
          const rel = getRel(state, npc.id);
          const moodBonus = { bonne: 0.1, neutre: 0, mauvaise: -0.12 }[moodTier(npc)];
          const chance = clamp(0.55 + rel.affinity/220 + moodBonus, 0.25, 0.9);
          if (Math.random() < chance){ adjustRelation(state, npc.id, { affinity: rndInt(3,6), trust: rndInt(1,3) }); return 'reussite'; }
          adjustRelation(state, npc.id, { affinity: rndInt(0,2) });
          return 'neutre';
        } },
      { id:'taquin', label:'Sur un ton taquin', sub:'plus mémorable, plus risqué',
        resolve(state, npc){
          const bonus = npc.traits.includes('sociable') || npc.traits.includes('séducteur') ? 0.15 : 0;
          const chance = clamp(0.42 + bonus + state.player.stats.charisme/260, 0.2, 0.8);
          if (Math.random() < chance){ adjustRelation(state, npc.id, { affinity: rndInt(5,9) }); bumpStyle(state,'leader',1); return 'reussite'; }
          if (Math.random() < 0.5) return 'neutre';
          adjustRelation(state, npc.id, { affinity: -rndInt(2,5) });
          return 'echec';
        } }
    ]
  },
  {
    id: 'ambition', label: 'Parler de son ambition', linesKey: 'ambition',
    available(){ return true; },
    approaches: [
      { id:'sincere', label:'Avec sincérité', sub:'+relation si ça passe',
        resolve(state, npc){
          const rel = getRel(state, npc.id);
          const chance = clamp(0.4 + rel.trust/200 + state.player.stats.charisme/300, 0.15, 0.85);
          if (Math.random() < chance){ adjustRelation(state, npc.id, { affinity: rndInt(4,8), trust: rndInt(3,6) }); return 'reussite'; }
          if (Math.random() < 0.5) return 'neutre';
          adjustRelation(state, npc.id, { trust: -rndInt(2,4) });
          return 'echec';
        } }
    ]
  },
  {
    id: 'rumeur', label: 'Aborder la rumeur qui circule', linesKey: 'rumeur',
    available(state, npc){ return (state.rumors||[]).some(r => r.subjectId === npc.id); },
    approaches: [
      { id:'direct', label:'De façon directe', sub:'peut apaiser la rumeur, ou envenimer les choses',
        resolve(state, npc){
          const rel = getRel(state, npc.id);
          const chance = clamp(0.35 + rel.trust/180 + state.player.stats.influence/280, 0.15, 0.8);
          const rumor = (state.rumors||[]).find(r => r.subjectId === npc.id);
          if (Math.random() < chance){
            if (rumor) rumor.strength = Math.max(0, rumor.strength - rndInt(15,30));
            adjustRelation(state, npc.id, { trust: rndInt(4,7) });
            return 'reussite';
          }
          if (Math.random() < 0.5) return 'neutre';
          if (rumor) rumor.strength = clamp(rumor.strength + rndInt(5,15), 0, 100);
          adjustRelation(state, npc.id, { affinity: -rndInt(3,6) });
          return 'echec';
        } }
    ]
  },
  {
    id: 'crise', label: 'Prendre des nouvelles après la crise', linesKey: 'crise',
    available(state){ return !!state.crisis; },
    approaches: [
      { id:'soutien', label:'Avec bienveillance', sub:'petit gain de réputation si ça touche',
        resolve(state, npc){
          const chance = clamp(0.5 + npc.stats.sangFroid/-400 + state.player.stats.sangFroid/300, 0.25, 0.85);
          if (Math.random() < chance){
            state.player.stats.reputation = clamp(state.player.stats.reputation + 2, 0, 100);
            adjustRelation(state, npc.id, { affinity: rndInt(3,6), trust: rndInt(2,4) });
            return 'reussite';
          }
          return 'neutre';
        } }
    ]
  },
  {
    id: 'sonder', label: 'Sonder discrètement', linesKey: 'sonder',
    available(state, npc){ return !state.player.knownSecrets.includes(npc.id); },
    approaches: [
      { id:'discret', label:'Sans se faire remarquer', sub:'accumule des indices vers son secret',
        resolve(state, npc){
          const rel = getRel(state, npc.id);
          const chance = clamp(0.25 + state.player.stats.influence/240 + rel.trust/260, 0.08, 0.7);
          if (Math.random() < chance){ markSecretHint(state, npc); bumpStyle(state,'discret',2); return 'reussite'; }
          if (Math.random() < 0.6) return 'neutre';
          npc.opinionOfPlayer = clamp(npc.opinionOfPlayer - 4, -100, 100);
          return 'echec';
        } }
    ]
  }
];

/** Exécute une discussion (sujet + approche choisis) et retourne le texte final à afficher. */
function runDialogue(state, npc, topic, approach){
  const tier = approach.resolve(state, npc);
  const pool = DIALOGUE_LINES[topic.linesKey][tier];
  const text = pick(pool)(npc);
  if (topic.id !== 'papoter' && tier !== 'neutre'){
    rememberNpc(state, npc, `Discussion (${topic.label.toLowerCase()}) — ${tier === 'reussite' ? 'un bon échange' : 'un échange tendu'}.`);
  }
  return text;
}

/* ---------------------------------------------------------------
   Semaines « spéciales » imprévues : cassent la prévisibilité du
   planning en imposant un événement soudain, sans aucun choix
   stratégique du joueur — on subit, on ne négocie pas.
   --------------------------------------------------------------- */
const SPECIAL_WEEK_EVENTS = [
  {
    id: 'sw_surprise_exam',
    type: 'surprise_exam',
    weight: 5,
    title: 'Examen surprise annoncé !',
    apply(state){
      const usedIds = state.scheduledExams.map(e => e.examId);
      const pool = EXAM_LIBRARY.filter(e => !usedIds.includes(e.id));
      const exam = pick(pool.length ? pool : EXAM_LIBRARY);
      state.scheduledExams.push({ examId: exam.id, week: state.time.week, surprise: true });
      const text = `Annonce tombée la veille au soir : un examen surprise — ${exam.icon} ${exam.name} — aura lieu cette semaine. Personne n'a eu le temps de s'y préparer sérieusement.`;
      addJournalEntry(state, text, 'majeur');
      return text;
    }
  },
  {
    id: 'sw_strike',
    type: 'greve',
    weight: 4,
    title: 'Grève des enseignants',
    apply(state){
      const lost = Math.round(state.classPoints[state.player.classId] * 0.04);
      state.classPoints[state.player.classId] = Math.max(0, state.classPoints[state.player.classId] - lost);
      const text = `Les enseignants se mettent en grève cette semaine : cours suspendus, encadrement minimal. Dans la confusion administrative, votre classe perd ${lost} points de classe.`;
      addJournalEntry(state, text, 'majeur');
      announceRankChanges(state, normalizeClassRanking(state));
      return text;
    }
  },
  {
    id: 'sw_incident',
    type: 'incident',
    weight: 3,
    title: 'Incident majeur',
    apply(state){
      const active = state.npcs.filter(n => n.status === 'actif' && n.id);
      const target = pick(active);
      target.status = 'absent';
      target.absentWeeksLeft = rndInt(2, 5);
      const text = `Un incident sérieux secoue l'école : ${target.fullName} est retiré(e) des cours pour une durée indéterminée. Les rumeurs les plus folles circulent dans les couloirs.`;
      addJournalEntry(state, text, 'majeur');
      if (!state.crisis){
        startCrisisArc(state, 'incident', { npcName: target.fullName, npcId: target.id });
      }
      return text;
    }
  },
  {
    id: 'sw_love_triangle',
    type: 'triangle_amoureux',
    weight: 4,
    requires(state){ return getActiveRomances(state).length >= 2 && !state.crisis; },
    title: 'Le triangle amoureux éclate',
    apply(state){
      const romances = getActiveRomances(state);
      const discovererId = pick(romances);
      const otherId = pick(romances.filter(id => id !== discovererId));
      const discoverer = getNpc(state, discovererId);
      const other = getNpc(state, otherId);
      adjustRelation(state, discovererId, { affinity: -15, trust: -20 });
      const text = `${discoverer.fullName} apprend, par une rumeur ou une indiscrétion, que vous entretenez aussi une relation avec ${other.fullName}. La nouvelle se répand vite — une confrontation semble inévitable.`;
      addJournalEntry(state, text, 'majeur');
      if (!state.crisis){
        startCrisisArc(state, 'triangle_amoureux', { discovererId, discovererName: discoverer.fullName, otherId, otherName: other.fullName });
      }
      return text;
    }
  }
];

/** Probabilité qu'une semaine spéciale imprévue survienne, croissante avec l'année (montée en tension). */
function specialWeekChance(state){
  const byYear = { 1: 0.12, 2: 0.15, 3: 0.20 };
  return byYear[state.time.year] || 0.14;
}

/**
 * Tire et déclenche une semaine spéciale imprévue. Retourne { type, title, text }.
 * En année 3, les événements les plus lourds (incident, grève) sont pondérés plus
 * fort pour que la dernière année pèse davantage. `forcedType` permet d'imposer un
 * type précis (utilisé par le filet de sécurité de fin d'année, voir advanceWeek).
 */
function triggerSpecialWeek(state, forcedType){
  let pool = SPECIAL_WEEK_EVENTS.filter(e => !e.requires || e.requires(state));
  if (!pool.length) pool = SPECIAL_WEEK_EVENTS.filter(e => !e.requires);
  if (forcedType){
    const forced = pool.filter(e => e.type === forcedType);
    if (forced.length) pool = forced;
  }
  const yearWeightBonus = state.time.year >= 3 ? { incident: 1.8, greve: 1.3 } : {};
  const ev = weightedChoice(pool.map(e => [e, (e.weight || 1) * (yearWeightBonus[e.type] || 1)]));
  const text = ev.apply(state);
  return { type: ev.type, title: ev.title, text };
}

/* ---------------------------------------------------------------
   Arcs de crise : certaines crises durables (state.crisis) sont
   désormais des enchaînements de plusieurs étapes liées plutôt qu'un
   simple décompte muet. Une étape est soit narrative (automatique,
   ajoute juste une entrée de journal), soit un vrai choix proposé au
   joueur dont les conséquences influencent la suite et la résolution
   finale de l'arc. Les crises déclenchées avec un `kind` absent de
   CRISIS_ARCS continuent de fonctionner exactement comme avant.
   --------------------------------------------------------------- */
const CRISIS_ARCS = {
  incident: {
    label: 'Tensions après l\'incident',
    stages: [
      { weeks: 2, narrative(state, data){
          return `Les rumeurs autour de l'absence de ${data.npcName} continuent d'enfler dans les couloirs. Certain(e)s vous demandent ouvertement ce que vous en savez.`;
        } },
      { weeks: 1, choice: {
          prompt(state, data){ return `L'administration convoque plusieurs élèves, dont vous, pour éclaircir les circonstances de l'incident impliquant ${data.npcName}.`; },
          options: [
            { label: 'Témoigner honnêtement', sub: '+réputation, mais expose vos proches',
              apply(state, data){
                state.player.stats.reputation = clamp(state.player.stats.reputation + 5, 0, 100);
                data.outcome = 'honnete';
                return `Votre témoignage, jugé sincère, est noté favorablement par l'administration.`;
              } },
            { label: 'Rester évasif(ve)', sub: 'protège vos relations, risque de suspicion',
              apply(state, data){
                state.player.stats.sangFroid = clamp(state.player.stats.sangFroid + 3, 0, 100);
                data.outcome = 'evasif';
                if (Math.random() < 0.4){
                  state.player.stats.reputation = clamp(state.player.stats.reputation - 4, 0, 100);
                  return `Votre réticence à parler n'échappe pas à l'administration, qui reste méfiante à votre égard.`;
                }
                return `Vous restez volontairement flou(e), sans que cela n'éveille de soupçon particulier.`;
              } }
          ]
        } },
      { weeks: 2, narrative(state, data){
          return data.outcome === 'honnete'
            ? `L'ambiance reste tendue, mais votre franchise pendant l'enquête a apaisé une partie des tensions.`
            : `L'ambiance reste lourde ; sans version claire des faits, les rumeurs continuent de circuler dans les couloirs.`;
        } }
    ],
    resolve(state, data){
      const txt = data.outcome === 'honnete'
        ? `L'affaire finit par se tasser. Votre honnêteté pendant la crise est encore mentionnée par certain(e)s.`
        : `L'affaire finit par se tasser, sans qu'on sache jamais vraiment ce qui s'est passé.`;
      addJournalEntry(state, txt, 'system');
    }
  },
  triangle_amoureux: {
    label: 'Triangle amoureux',
    stages: [
      { weeks: 1, narrative(state, data){
          return `L'ambiance est tendue : ${data.discovererName} évite votre regard depuis qu'il/elle sait, pour ${data.otherName}.`;
        } },
      { weeks: 1, choice: {
          prompt(state, data){ return `${data.discovererName} vous demande des comptes en face à face au sujet de votre relation avec ${data.otherName}. Comment gérez-vous la crise ?`; },
          options: [
            { label: 'Rester fidèle à cette personne, rompre avec l\'autre', sub: 'Relation exclusive retrouvée, mais vous perdez l\'autre romance', apply(state, data){
                const discoverer = getNpc(state, data.discovererId);
                const other = getNpc(state, data.otherId);
                adjustRelation(state, data.otherId, { affinity: -30, trust: -30 });
                const otherRel = getRel(state, data.otherId); otherRel.type = 'ex';
                adjustRelation(state, data.discovererId, { affinity: 18, trust: 15 });
                state.player.flags.relationshipStyle = 'exclusive';
                state.stats_meta.couplesBroken = (state.stats_meta.couplesBroken||0) + 1;
                data.outcome = 'exclusif';
                return `Vous choisissez ${discoverer ? discoverer.fullName : 'cette personne'} sans détour. La rupture avec ${other ? other.fullName : 'l\'autre'} est brutale, mais votre honnêteté rassure celui/celle qui reste.`;
              } },
            { label: 'Assumer les deux, proposer une relation ouverte', sub: 'Risqué — dépend de l\'affinité et de votre charisme', apply(state, data){
                const discoverer = getNpc(state, data.discovererId);
                const rel = getRel(state, data.discovererId);
                const chance = clamp(0.25 + rel.affinity/200 + state.player.stats.charisme/200, 0.1, 0.75);
                if (Math.random() < chance){
                  adjustRelation(state, data.discovererId, { affinity: 6, trust: -8 });
                  state.player.flags.relationshipStyle = 'libre';
                  data.outcome = 'ouverte_acceptee';
                  return `Contre toute attente, ${discoverer ? discoverer.fullName : 'cette personne'} accepte de partager votre cœur — la confiance en ressort tout de même fragilisée.`;
                }
                adjustRelation(state, data.discovererId, { affinity: -35, trust: -35 });
                getRel(state, data.discovererId).type = 'ex';
                state.player.stats.reputation = clamp(state.player.stats.reputation - 4, 0, 100);
                data.outcome = 'ouverte_refusee';
                return `${discoverer ? discoverer.fullName : 'Cette personne'} refuse catégoriquement et met fin à votre relation sur-le-champ.`;
              } },
            { label: 'Mentir et nier en bloc', sub: 'Étouffe la crise dans l\'immédiat, mais peut ressurgir plus tard', apply(state, data){
                const chance = clamp(0.3 + state.player.stats.sangFroid/220 + state.player.stats.charisme/260, 0.1, 0.8);
                if (Math.random() < chance){
                  adjustRelation(state, data.discovererId, { affinity: -4, trust: -10 });
                  scheduleConsequence(state, { weeksFromNow: rndInt(3, 6), kind:'betrayal_spreads', data:{ npcId: data.discovererId } });
                  data.outcome = 'mensonge_reussi';
                  return `Votre sang-froid impressionne : ${getNpc(state, data.discovererId) ? getNpc(state, data.discovererId).fullName : 'cette personne'} semble se satisfaire de vos explications — pour l'instant.`;
                }
                adjustRelation(state, data.discovererId, { affinity: -40, trust: -45, fear: 5 });
                getRel(state, data.discovererId).type = 'ex';
                state.player.stats.reputation = clamp(state.player.stats.reputation - 8, 0, 100);
                addRumor(state, { subjectId:'player', subjectName: state.player.name, valence:'bad', strength: rndInt(35,55) });
                data.outcome = 'mensonge_echoue';
                return `Le mensonge est vite percé à jour. La rupture est immédiate, et la rumeur enfle déjà dans les couloirs.`;
              } }
          ]
        } },
      { weeks: 1, narrative(state, data){
          const flavors = {
            exclusif: `La situation s'apaise : votre choix a clarifié les choses, même si ${data.otherName} garde ses distances.`,
            ouverte_acceptee: `L'équilibre reste précaire, mais ${data.discovererName} et ${data.otherName} semblent tolérer la situation, chacun(e) à sa manière.`,
            ouverte_refusee: `${data.discovererName} ne vous adresse plus la parole. ${data.otherName}, en revanche, ignore encore tout de cette rupture.`,
            mensonge_reussi: `Les esprits se calment doucement — mais le doute, une fois semé, ne disparaît jamais complètement.`,
            mensonge_echoue: `L'ambiance reste électrique ; la rumeur d'un triangle amoureux continue de circuler dans l'école.`
          };
          return flavors[data.outcome] || `La tension retombe peu à peu autour de cette histoire à trois.`;
        } }
    ],
    resolve(state, data){
      addJournalEntry(state, `Le triangle amoureux impliquant ${data.discovererName} et ${data.otherName} finit par se dénouer, non sans laisser de traces.`, 'majeur');
    }
  },
  exam_fallout: {
    label: 'Retombées d\'un échec',
    stages: [
      { weeks: 2, narrative(state, data){
          return `Les retombées de l'échec à ${data.examName} continuent de peser sur l'ambiance de la classe.`;
        } },
      { weeks: 2, narrative(state, data){
          return `L'ambiance s'apaise peu à peu, même si certain(e)s camarades restent sur leurs gardes.`;
        } }
    ],
    resolve(state, data){
      addJournalEntry(state, `La crise (${state.crisis.label}) finit par se résorber. L'ambiance redevient peu à peu normale.`, 'system');
    }
  }
};

/** Démarre une crise durable sous forme d'arc à étapes. Ne fait rien si une crise est déjà en cours (comme avant). */
function startCrisisArc(state, kind, data){
  if (state.crisis) return;
  const arcDef = CRISIS_ARCS[kind];
  if (!arcDef) return;
  state.majorCrisisThisYear = true;
  const totalWeeks = arcDef.stages.reduce((sum, st) => sum + st.weeks, 0);
  state.crisis = {
    label: arcDef.label,
    kind,
    stageIndex: 0,
    weeksUntilNextStage: arcDef.stages[0].weeks,
    weeksLeft: totalWeeks, // conservé pour l'affichage existant ("encore X semaine(s)")
    data: data || {}
  };
}

/** Fait avancer une crise-arc à l'étape suivante, ou la résout si c'était la dernière. */
function advanceCrisisToNextStage(state, arcDef){
  const c = state.crisis;
  c.stageIndex++;
  if (c.stageIndex >= arcDef.stages.length){
    if (arcDef.resolve) arcDef.resolve(state, c.data);
    else addJournalEntry(state, `La crise (${c.label}) finit par se résorber. L'ambiance redevient peu à peu normale.`, 'system');
    state.crisis = null;
  } else {
    c.weeksUntilNextStage = arcDef.stages[c.stageIndex].weeks;
    c.weeksLeft = arcDef.stages.slice(c.stageIndex).reduce((s,st)=>s+st.weeks,0);
  }
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
  2: "Une nouvelle année débute à LNHS. Les visages familiers ont changé — certains se sont endurcis, d'autres ont disparu des couloirs sans explication officielle.",
  3: "Dernière année. L'administration ne cache plus que les meilleurs éléments seront observés de près pour l'après-LNHS. Chaque décision pèse désormais double."
};

/* ---------------------------------------------------------------
   Score final — récapitulatif de fin de partie (expulsion ou
   diplôme après 3 ans). Le score n'est pas une note sur 100 : c'est
   un total de points cumulés selon ce que le joueur a effectivement
   accompli pendant les trois années, positif ou négatif selon la
   nature de l'action.
   --------------------------------------------------------------- */
const SCORE_RANKS = [
  { min: 3000,       label:'Légende de LNHS',        color:'var(--gold)' },
  { min: 2000,       label:'Élite reconnue',          color:'var(--gold-soft)' },
  { min: 1200,       label:'Dossier solide',          color:'var(--azure)' },
  { min: 600,        label:'Parcours honorable',      color:'var(--text-dim)' },
  { min: 0,          label:'Dossier discret',         color:'var(--text-faint)' },
  { min: -Infinity,  label:'Dossier catastrophique',  color:'#ff5c5c' }
];
function getScoreRank(total){
  return SCORE_RANKS.find(r => total >= r.min) || SCORE_RANKS[SCORE_RANKS.length-1];
}

/** Calcule le score final détaillé (liste de lignes {label, points} + total). */
function computeFinalScore(state){
  const s = state;
  const items = [];
  const add = (label, points) => { if (points) items.push({ label, points: Math.round(points) }); };

  add('Points personnels accumulés', s.player.points / 10);
  add(`Classe finale (${s.player.classId})`, { A:500, B:300, C:150, D:50 }[s.player.classId] || 0);
  add('Réputation', s.player.stats.reputation * 3);
  add('Popularité', s.player.stats.popularite * 2);
  add('Influence', s.player.stats.influence * 2);
  add('Secrets découverts', (s.player.knownSecrets.length||0) * 15);
  add('Alliances formées', (s.stats_meta.alliancesFormed||0) * 20);
  add('Trahisons commises', -(s.stats_meta.betrayals||0) * 10);

  const examTierPoints = { critique:40, reussite:20, partiel:5, echec:-10 };
  const examScore = (s.player.examHistory||[]).reduce((sum,h) => sum + (examTierPoints[h.tier]||0), 0);
  add('Résultats aux examens', examScore);

  add('Objectifs narratifs accomplis', (s.goals||[]).filter(g=>g.status==='success').length * 100);
  add('Objectifs narratifs échoués', -(s.goals||[]).filter(g=>g.status==='failed').length * 20);
  add('Accomplissements débloqués', (s.player.unlockedAchievements||[]).length * 25);
  add('Enseignants mis en échec', (s.stats_meta.teachersDefeated||0) * 80);
  add('Zone d\'ombre (White Room) déjouée', (s.stats_meta.whiteRoomDefeated||0) * 150);

  const promise = s.player.flags.marriagePromise;
  if (promise){
    const npc = getNpc(s, promise.npcId);
    const stillActive = npc && getRel(s, promise.npcId).type !== 'ex';
    add('Promesse d\'avenir', stillActive ? 150 : 40);
  }
  add('Romance(s) active(s) en fin de parcours', getActiveRomances(s).length * 30);
  add('Amitiés proches nouées', Object.values(s.player.relationships).filter(r=>r.type==='ami proche').length * 10);
  add('Couples rivaux brisés par manipulation', (s.stats_meta.couplesBroken||0) * 10);
  add('Campagnes de destruction sociale réussies', (s.stats_meta.socialDestructions||0) * -15);
  add('Accusations montées de toutes pièces', (s.stats_meta.framedExpulsions||0) * 30);
  add('Complots retournés contre vous', (s.stats_meta.frameBackfires||0) * -25);
  if (s.player.flags.arrested) add('Affaire judiciaire', -1200);
  else if (s.player.flags.expelled) add('Expulsion de LNHS', -600);

  const total = items.reduce((sum,i) => sum + i.points, 0);
  return { items, total };
}

const ENDING_FLAVOR = [
  { minPoints: 1500, minClass: 'A', text: "Votre dossier quitte LNHS auréolé de succès : Classe A, réputation impeccable, réseau tentaculaire. On se souviendra de vous — pour les bonnes raisons, ou presque." },
  { minPoints: 800,  minClass: 'B', text: "Vous achevez votre parcours dans une position solide, respecté(e) sans être une légende. Un dossier honorable, qui ouvre des portes sans en garantir aucune." },
  { minPoints: 0,    minClass: 'D', text: "Votre dossier se referme discrètement, sans éclat particulier. À LNHS, l'oubli est parfois la seule échappatoire à l'échec." }
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
  const promise = state.player.flags.marriagePromise;
  let romanceText = '';
  if (promise){
    const npc = getNpc(state, promise.npcId);
    const stillActive = npc && getRel(state, promise.npcId).type !== 'ex';
    if (npc && stillActive){
      romanceText = ` Vous quittez LNHS avec une promesse d'avenir scellée auprès de ${npc.fullName} — quoi qu'il arrive après ces trois années, votre histoire ne s'arrête pas ici.`;
    } else if (npc){
      romanceText = ` La promesse jadis faite à ${npc.fullName} n'aura pas survécu à ces trois années tumultueuses.`;
    }
  } else if (getActiveRomances(state).length >= 2){
    romanceText = ` Vous quittez LNHS le cœur partagé entre plusieurs histoires jamais tout à fait résolues.`;
  } else if (getActiveRomances(state).length === 1){
    const npc = getNpc(state, getActiveRomances(state)[0]);
    if (npc) romanceText = ` Votre histoire avec ${npc.fullName} continue, sans engagement formel pour l'instant.`;
  }
  return best.text + styleText + romanceText;
}

/* ---------------------------------------------------------------
   Promesse / mariage de fin d'année 3 — vers la mi-fin de la
   dernière année, si une romance a atteint un niveau suffisant
   d'affinité et de confiance, le joueur se voit offrir l'occasion
   de sceller un engagement durable, qui influence la fin du jeu.
   --------------------------------------------------------------- */
function checkMarriageMoment(state){
  if (state.time.year !== MAX_YEARS) return null;
  if (state.player.flags.marriageOffered) return null;
  if (state.time.week !== Math.round(WEEKS_PER_YEAR * 0.85)) return null;
  const romances = getActiveRomances(state)
    .map(id => ({ id, npc: getNpc(state, id), rel: getRel(state, id) }))
    .filter(r => r.npc && r.npc.status === 'actif');
  if (!romances.length) return null;
  romances.sort((a,b) => (b.rel.affinity + b.rel.trust) - (a.rel.affinity + a.rel.trust));
  const best = romances[0];
  if (best.rel.affinity < 65 || best.rel.trust < 45) return null;
  state.player.flags.marriageOffered = true;
  return best;
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
    }},
  { id:'item_club_kit', name:'Équipement de club premium', price:220, desc:'+2 dans chaque statistique liée à votre club actuel (nécessite d\'être membre d\'un club).', apply(state){
      const club = getClub(state.player.clubId);
      if (!club){ addJournalEntry(state, `L'équipement de club acheté reste inutile : vous n'êtes membre d'aucun club.`, 'shop'); return; }
      Object.keys(club.bonus).forEach(k => { state.player.stats[k] = clamp(state.player.stats[k] + 2, 0, 100); });
    }},
  { id:'item_social_account', name:'Compte d\'influence anonyme', price:300, desc:'+3 Popularité, +2 Influence.', apply(state){
      state.player.stats.popularite = clamp(state.player.stats.popularite+3,0,100);
      state.player.stats.influence = clamp(state.player.stats.influence+2,0,100);
    }},
  { id:'item_private_tutor', name:'Tuteur particulier', price:260, desc:'+3 Intelligence, +1 Sang-froid.', apply(state){
      state.player.stats.intelligence = clamp(state.player.stats.intelligence+3,0,100);
      state.player.stats.sangFroid = clamp(state.player.stats.sangFroid+1,0,100);
    }},
  { id:'item_energy_drink', name:'Boisson énergisante', price:90, desc:'Objet abordable — +1 Endurance, +1 Sang-froid.', apply(state){
      state.player.stats.endurance = clamp(state.player.stats.endurance+1,0,100);
      state.player.stats.sangFroid = clamp(state.player.stats.sangFroid+1,0,100);
    }},
  { id:'item_photo_studio', name:'Séance photo professionnelle', price:300, desc:'+3 Popularité.', apply(state){
      state.player.stats.popularite = clamp(state.player.stats.popularite+3,0,100);
    }},
  { id:'item_debate_coach', name:'Coach en art oratoire', price:280, desc:'+3 Charisme, +1 Influence.', apply(state){
      state.player.stats.charisme = clamp(state.player.stats.charisme+3,0,100);
      state.player.stats.influence = clamp(state.player.stats.influence+1,0,100);
    }},
  { id:'item_forged_recommendation', name:'Lettre de recommandation falsifiée', price:450, stock:2, desc:'RARE (stock limité) — +3 Réputation, +2 Influence.', apply(state){
      state.player.stats.reputation = clamp(state.player.stats.reputation+3,0,100);
      state.player.stats.influence = clamp(state.player.stats.influence+2,0,100);
    }},
  { id:'item_underground_contact', name:'Contact souterrain', price:500, stock:1, desc:'RARE (stock unique) — Révèle les secrets de deux élèves différents et +3 Influence.', apply(state){
      const pool = state.npcs.filter(n => !state.player.knownSecrets.includes(n.id) && n.status==='actif');
      const targets = pickN(pool, Math.min(2, pool.length));
      targets.forEach(t => { state.player.knownSecrets.push(t.id); state.stats_meta.secretsDiscovered++; });
      state.player.stats.influence = clamp(state.player.stats.influence+3,0,100);
      if (targets.length) addJournalEntry(state, `Votre contact souterrain révèle les secrets de ${targets.map(t=>t.fullName).join(', ')}.`, 'secret');
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
    category: 'social', hidden: false,
    check(state){ return state.stats_meta.secretsDiscovered >= 1; },
    reward(state){ state.player.points += 80; return 'Récompense : +80 points.'; }
  },
  {
    id: 'ach_alliance_architect',
    name: 'Architecte d\'alliances',
    desc: 'Former trois alliances au cours de votre scolarité.',
    category: 'social', hidden: false,
    check(state){ return state.stats_meta.alliancesFormed >= 3; },
    reward(state){ state.player.points += 150; state.player.stats.influence = clamp(state.player.stats.influence+3,0,100); return 'Récompense : +150 points, +3 Influence.'; }
  },
  {
    id: 'ach_cold_blade',
    name: 'La lame après la révérence',
    desc: 'Trahir un(e) allié(e) pour la première fois.',
    category: 'sombre', hidden: false,
    check(state){ return state.stats_meta.betrayals >= 1; },
    reward(state){ state.player.stats.sangFroid = clamp(state.player.stats.sangFroid+2,0,100); return 'Récompense : +2 Sang-froid.'; }
  },
  {
    id: 'ach_ruthless',
    name: 'Sans pitié',
    desc: 'Trahir trois allié(e)s différent(e)s.',
    category: 'sombre', hidden: false,
    check(state){ return state.stats_meta.betrayals >= 3; },
    reward(state){ state.player.points += 150; state.player.stats.influence = clamp(state.player.stats.influence+3,0,100); return 'Récompense : +150 points, +3 Influence.'; }
  },
  {
    id: 'ach_veteran_strategist',
    name: 'Stratège éprouvé',
    desc: 'Compléter cinq examens spéciaux, quel qu\'en soit le résultat.',
    category: 'academique', hidden: false,
    check(state){ return state.stats_meta.examsCompleted >= 5; },
    reward(state){ state.player.points += 200; state.player.stats.intelligence = clamp(state.player.stats.intelligence+2,0,100); return 'Récompense : +200 points, +2 Intelligence.'; }
  },
  {
    id: 'ach_secret_collector',
    name: 'Collectionneur de secrets',
    desc: 'Connaître les secrets de huit élèves différents.',
    category: 'social', hidden: false,
    check(state){ return state.player.knownSecrets.length >= 8; },
    reward(state){ state.player.points += 250; state.player.stats.influence = clamp(state.player.stats.influence+3,0,100); return 'Récompense : +250 points, +3 Influence.'; }
  },
  {
    id: 'ach_wide_network',
    name: 'Réseau tentaculaire',
    desc: 'Entretenir une relation forte (affinité 50+) avec au moins six élèves.',
    category: 'social', hidden: false,
    check(state){ return Object.values(state.player.relationships).filter(r => r.affinity >= 50).length >= 6; },
    reward(state){ state.player.points += 200; state.player.stats.charisme = clamp(state.player.stats.charisme+2,0,100); return 'Récompense : +200 points, +2 Charisme.'; }
  },
  {
    id: 'ach_class_a',
    name: 'Ombre de la Classe A',
    desc: 'Intégrer la classe A, sommet de la hiérarchie scolaire.',
    category: 'pouvoir', hidden: false,
    check(state){ return state.player.classId === 'A'; },
    reward(state){ state.player.points += 300; state.player.stats.reputation = clamp(state.player.stats.reputation+3,0,100); return 'Récompense : +300 points, +3 Réputation.'; }
  },
  {
    id: 'ach_second_year',
    name: 'Survivant de première année',
    desc: 'Atteindre la deuxième année à LNHS.',
    category: 'academique', hidden: false,
    check(state){ return state.time.year >= 2; },
    reward(state){ state.player.points += 150; return 'Récompense : +150 points.'; }
  },
  {
    id: 'ach_legend',
    name: 'Légende de l\'académie',
    desc: 'Achever votre parcours à LNHS avec plus de 1500 points personnels.',
    category: 'pouvoir', hidden: false,
    check(state){ return state.gameOver && state.player.points >= 1500; },
    reward(state){ state.player.points += 500; return 'Récompense : +500 points.'; }
  },
  {
    id: 'ach_club_member',
    name: 'Esprit de club',
    desc: 'Rejoindre votre premier club scolaire.',
    category: 'social', hidden: false,
    check(state){ return !!state.player.clubId; },
    reward(state){ state.player.points += 60; return 'Récompense : +60 points.'; }
  },
  {
    id: 'ach_council_seat',
    name: 'Voix du conseil',
    desc: 'Obtenir un siège au conseil des élèves.',
    category: 'pouvoir', hidden: false,
    check(state){ return !!state.player.flags.studentCouncil; },
    reward(state){ state.player.points += 200; state.player.stats.influence = clamp(state.player.stats.influence+3,0,100); return 'Récompense : +200 points, +3 Influence.'; }
  },
  {
    id: 'ach_polymath',
    name: 'Polymathe',
    desc: 'Atteindre au moins 25 dans toutes vos statistiques.',
    category: 'academique', hidden: false,
    check(state){ return STAT_KEYS.every(k => state.player.stats[k] >= 25); },
    reward(state){ state.player.points += 250; return 'Récompense : +250 points.'; }
  },

  /* -------------------- Romance / harem -------------------- */
  {
    id: 'ach_first_romance',
    name: 'Premier émoi',
    desc: 'Nouer votre toute première romance à LNHS.',
    category: 'romance', hidden: false,
    check(state){ return Object.values(state.player.relationships).some(r => r.type === 'romance' || r.type === 'ex'); },
    reward(state){ state.player.stats.charisme = clamp(state.player.stats.charisme+2,0,100); return 'Récompense : +2 Charisme.'; }
  },
  {
    id: 'ach_harem_double',
    name: 'Cœur partagé',
    desc: 'Mener deux romances actives en même temps.',
    category: 'romance', hidden: false,
    check(state){ return (state.stats_meta.maxConcurrentRomances || 0) >= 2; },
    reward(state){ state.player.points += 120; bumpStyle(state, 'manipulateur', 2); return 'Récompense : +120 points.'; }
  },
  {
    id: 'ach_harem_triple',
    name: 'Collectionneur de cœurs',
    desc: 'Mener trois romances actives en même temps.',
    category: 'romance', hidden: false,
    check(state){ return (state.stats_meta.maxConcurrentRomances || 0) >= 3; },
    reward(state){ state.player.points += 220; state.player.stats.charisme = clamp(state.player.stats.charisme+3,0,100); return 'Récompense : +220 points, +3 Charisme.'; }
  },
  {
    id: 'ach_harem_master',
    name: 'Maître du harem',
    desc: 'Mener quatre romances actives en même temps — un exploit qui ne passe pas inaperçu.',
    category: 'romance', hidden: false,
    check(state){ return (state.stats_meta.maxConcurrentRomances || 0) >= 4; },
    reward(state){ state.player.points += 350; state.player.stats.popularite = clamp(state.player.stats.popularite+5,0,100); return 'Récompense : +350 points, +5 Popularité.'; }
  },
  {
    id: 'ach_true_love',
    name: 'Grand amour',
    desc: 'Atteindre une affinité de 90 ou plus avec un(e) partenaire.',
    category: 'romance', hidden: false,
    check(state){ return Object.values(state.player.relationships).some(r => r.type === 'romance' && r.affinity >= 90); },
    reward(state){ state.player.stats.sangFroid = clamp(state.player.stats.sangFroid+3,0,100); return 'Récompense : +3 Sang-froid.'; }
  },

  /* -------------------- Professeurs -------------------- */
  {
    id: 'ach_teacher_down',
    name: 'Autorité déchue',
    desc: 'Faire renvoyer un(e) professeur(e) à l\'issue d\'une confrontation.',
    category: 'pouvoir', hidden: false,
    check(state){ return (state.stats_meta.teachersDefeated || 0) >= 1; },
    reward(state){ state.player.points += 250; state.player.stats.influence = clamp(state.player.stats.influence+4,0,100); return 'Récompense : +250 points, +4 Influence.'; }
  },
  {
    id: 'ach_teacher_purge',
    name: 'Purge du corps enseignant',
    desc: 'Faire renvoyer trois professeur(e)s différent(e)s.',
    category: 'pouvoir', hidden: false,
    check(state){ return (state.stats_meta.teachersDefeated || 0) >= 3; },
    reward(state){ state.player.points += 500; state.player.stats.reputation = clamp(state.player.stats.reputation+5,0,100); return 'Récompense : +500 points, +5 Réputation.'; }
  },
  {
    id: 'ach_teacher_discredit',
    name: 'Réputation entachée',
    desc: 'Discréditer un(e) professeur(e) sans parvenir à le/la faire renvoyer.',
    category: 'pouvoir', hidden: false,
    check(state){ return Object.values(state.player.teacherDossiers || {}).some(d => d.status === 'discredite'); },
    reward(state){ state.player.points += 100; return 'Récompense : +100 points.'; }
  },
  {
    id: 'ach_teacher_lesson_learned',
    name: 'Leçon apprise',
    desc: 'Voir une confrontation avec un(e) professeur(e) se retourner contre vous, et continuer malgré tout.',
    category: 'cache', hidden: true,
    check(state){ return Object.values(state.player.teacherDossiers || {}).some(d => d.status === 'echec') && !state.gameOver; },
    reward(state){ state.player.stats.sangFroid = clamp(state.player.stats.sangFroid+4,0,100); return 'Récompense : +4 Sang-froid.'; }
  },

  /* -------------------- Manipulation / complots -------------------- */
  {
    id: 'ach_frame_success',
    name: 'Marionnettiste',
    desc: 'Faire exclure un(e) élève en manipulant un(e) autre pour porter l\'accusation.',
    category: 'sombre', hidden: false,
    check(state){ return (state.stats_meta.framedExpulsions || 0) >= 1; },
    reward(state){ state.player.points += 300; bumpStyle(state, 'manipulateur', 4); return 'Récompense : +300 points.'; }
  },
  {
    id: 'ach_frame_master',
    name: 'Grand architecte du chaos',
    desc: 'Faire exclure trois élèves différent(e)s par manipulation interposée.',
    category: 'sombre', hidden: false,
    check(state){ return (state.stats_meta.framedExpulsions || 0) >= 3; },
    reward(state){ state.player.points += 600; state.player.stats.influence = clamp(state.player.stats.influence+6,0,100); return 'Récompense : +600 points, +6 Influence.'; }
  },
  {
    id: 'ach_frame_backfire',
    name: 'Le retour de bâton',
    desc: 'Voir un complot se retourner contre vous, et malgré tout continuer à tirer les ficelles.',
    category: 'cache', hidden: true,
    check(state){ return (state.stats_meta.frameBackfires || 0) >= 1; },
    reward(state){ state.player.stats.sangFroid = clamp(state.player.stats.sangFroid+3,0,100); return 'Récompense : +3 Sang-froid.'; }
  },
  {
    id: 'ach_puppetmaster_total',
    name: 'Manipulateur absolu',
    desc: 'Atteindre un score de style « Manipulateur » de 50 ou plus.',
    category: 'sombre', hidden: false,
    check(state){ return (state.player.playstyle.manipulateur || 0) >= 50; },
    reward(state){ state.player.points += 300; return 'Récompense : +300 points.'; }
  },

  /* -------------------- Académique / divers -------------------- */
  {
    id: 'ach_exam_critical',
    name: 'Excellence sous pression',
    desc: 'Obtenir une réussite critique à un examen.',
    category: 'academique', hidden: false,
    check(state){ return state.player.examHistory.some(h => h.tier === 'critique'); },
    reward(state){ state.player.points += 200; state.player.stats.intelligence = clamp(state.player.stats.intelligence+3,0,100); return 'Récompense : +200 points, +3 Intelligence.'; }
  },
  {
    id: 'ach_exam_comeback',
    name: 'Rattrapage difficile',
    desc: 'Échouer à trois examens au cours de votre scolarité — et rester malgré tout à LNHS.',
    category: 'cache', hidden: true,
    check(state){ return state.player.examHistory.filter(h => h.tier === 'echec').length >= 3 && !state.gameOver; },
    reward(state){ state.player.stats.endurance = clamp(state.player.stats.endurance+3,0,100); return 'Récompense : +3 Endurance.'; }
  },
  {
    id: 'ach_points_baron',
    name: 'Baron des points',
    desc: 'Accumuler 2000 points personnels.',
    category: 'pouvoir', hidden: false,
    check(state){ return state.player.points >= 2000; },
    reward(state){ state.player.stats.influence = clamp(state.player.stats.influence+3,0,100); return 'Récompense : +3 Influence.'; }
  },
  {
    id: 'ach_crisis_veteran',
    name: 'Vétéran des crises',
    desc: 'Traverser au moins cinq événements majeurs au cours de votre scolarité.',
    category: 'academique', hidden: false,
    check(state){ return state.player.journal.filter(e => e.type === 'majeur').length >= 5; },
    reward(state){ state.player.stats.sangFroid = clamp(state.player.stats.sangFroid+3,0,100); return 'Récompense : +3 Sang-froid.'; }
  },
  {
    id: 'ach_campus_idol',
    name: 'Idole du campus',
    desc: 'Atteindre 90 de popularité.',
    category: 'social', hidden: false,
    check(state){ return state.player.stats.popularite >= 90; },
    reward(state){ state.player.points += 200; return 'Récompense : +200 points.'; }
  },
  {
    id: 'ach_duel_champion',
    name: 'Champion des duels',
    desc: 'Remporter cinq duels contre d\'autres élèves.',
    category: 'pouvoir', hidden: false,
    check(state){ return (state.stats_meta.duelsWon || 0) >= 5; },
    reward(state){ state.player.stats.force = clamp(state.player.stats.force+2,0,100); state.player.stats.charisme = clamp(state.player.stats.charisme+2,0,100); return 'Récompense : +2 Force, +2 Charisme.'; }
  },
  {
    id: 'ach_debt_free',
    name: 'Dette effacée',
    desc: 'Rembourser intégralement un prêt contracté auprès du prêteur sur gages.',
    category: 'divers', hidden: true,
    check(state){ return (state.stats_meta.loansRepaid || 0) >= 1; },
    reward(state){ state.player.stats.reputation = clamp(state.player.stats.reputation+3,0,100); return 'Récompense : +3 Réputation.'; }
  },
  {
    id: 'ach_feared_not_loved',
    name: 'Craint(e) plutôt qu\'aimé(e)',
    desc: 'Bâtir une influence considérable tout en ayant une réputation exécrable.',
    category: 'cache', hidden: true,
    check(state){ return state.player.stats.reputation <= 15 && state.player.stats.influence >= 50; },
    reward(state){ state.player.stats.sangFroid = clamp(state.player.stats.sangFroid+4,0,100); return 'Récompense : +4 Sang-froid.'; }
  },
  {
    id: 'ach_invisible_student',
    name: 'Personne ne vous remarque jamais',
    desc: 'Atteindre la deuxième année à LNHS en restant presque totalement inconnu(e).',
    category: 'cache', hidden: true,
    check(state){ return state.time.year >= 2 && state.player.stats.popularite <= 5; },
    reward(state){ state.player.stats.chance = clamp(state.player.stats.chance+4,0,100); return 'Récompense : +4 Chance.'; }
  },
  {
    id: 'ach_jack_of_all_trades',
    name: 'Touche-à-tout',
    desc: 'Essayer chaque activité hebdomadaire disponible au moins une fois.',
    category: 'academique', hidden: false,
    check(state){ return (state.stats_meta.uniqueActivitiesUsed || []).length >= Object.keys(ACTIVITIES).length; },
    reward(state){ state.player.points += 220; return 'Récompense : +220 points.'; }
  },
  {
    id: 'ach_gambler',
    name: 'Habitué du marché noir',
    desc: 'Remporter trois paris au marché noir.',
    category: 'sombre', hidden: false,
    check(state){ return (state.stats_meta.blackMarketWins || 0) >= 3; },
    reward(state){ state.player.points += 200; state.player.stats.chance = clamp(state.player.stats.chance+2,0,100); return 'Récompense : +200 points, +2 Chance.'; }
  },
  {
    id: 'ach_student_council',
    name: 'Voix du conseil',
    desc: 'Obtenir un siège au conseil des élèves.',
    category: 'social', hidden: false,
    check(state){ return !!state.player.flags.studentCouncil; },
    reward(state){ state.player.stats.influence = clamp(state.player.stats.influence+3,0,100); return 'Récompense : +3 Influence.'; }
  },
  {
    id: 'ach_wealthy',
    name: 'Fortune personnelle',
    desc: 'Accumuler 2500 points personnels en même temps.',
    category: 'academique', hidden: false,
    check(state){ return state.player.points >= 2500; },
    reward(state){ state.player.stats.reputation = clamp(state.player.stats.reputation+3,0,100); return 'Récompense : +3 Réputation.'; }
  },
  {
    id: 'ach_well_rounded',
    name: 'Profil complet',
    desc: 'Atteindre au moins 70 dans chacune des neuf statistiques.',
    category: 'academique', hidden: true,
    check(state){ return STAT_KEYS.every(k => state.player.stats[k] >= 70); },
    reward(state){ state.player.points += 300; return 'Récompense : +300 points.'; }
  },
  {
    id: 'ach_survivor_year3',
    name: 'Jusqu\'au bout',
    desc: 'Atteindre la troisième année scolaire à LNHS.',
    category: 'academique', hidden: false,
    check(state){ return state.time.year >= 3; },
    reward(state){ state.player.stats.sangFroid = clamp(state.player.stats.sangFroid+3,0,100); return 'Récompense : +3 Sang-froid.'; }
  },
  {
    id: 'ach_heartbreaker',
    name: 'Brise-cœur',
    desc: 'Briser trois couples différents.',
    category: 'sombre', hidden: false,
    check(state){ return (state.stats_meta.couplesBroken || 0) >= 3; },
    reward(state){ state.player.stats.charisme = clamp(state.player.stats.charisme+3,0,100); return 'Récompense : +3 Charisme.'; }
  },
  {
    id: 'ach_puppeteer',
    name: 'Marionnettiste',
    desc: 'Pousser deux élèves à quitter LNHS via une campagne de destruction sociale.',
    category: 'sombre', hidden: true,
    check(state){ return (state.stats_meta.socialDestructions || 0) >= 2; },
    reward(state){ state.player.points += 260; state.player.stats.influence = clamp(state.player.stats.influence+4,0,100); return 'Récompense : +260 points, +4 Influence.'; }
  },
  {
    id: 'ach_white_room_expose',
    name: 'Le masque tombe',
    desc: 'Démasquer l\'élève de la White Room infiltré(e) dans votre classe.',
    category: 'cache', hidden: true,
    check(state){ return !!(state.whiteRoom && state.whiteRoom.stage === 'exposed'); },
    reward(state){ state.player.stats.sangFroid = clamp(state.player.stats.sangFroid+3,0,100); return 'Récompense : +3 Sang-froid.'; }
  },
  {
    id: 'ach_white_room_victory',
    name: 'Hors de portée, vraiment ?',
    desc: 'Forcer l\'élève de la White Room à renoncer à s\'intéresser à vous.',
    category: 'cache', hidden: true,
    check(state){ return (state.stats_meta.whiteRoomDefeated || 0) >= 1; },
    reward(state){ state.player.points += 400; STAT_KEYS.forEach(k => { state.player.stats[k] = clamp(state.player.stats[k]+1,0,100); }); return 'Récompense : +400 points, +1 dans toutes les statistiques.'; }
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
    if (state.player.clubId === undefined) state.player.clubId = null;
    if (!state.shopStock) state.shopStock = SHOP_ITEMS.reduce((acc, it) => { if (it.stock != null) acc[it.id] = it.stock; return acc; }, {});
    (state.npcs || []).forEach(n => { if (!n.memory) n.memory = []; });
    // Migration : enjeux réels, semaines spéciales, objectifs à échéance (v1 -> v2)
    if (state.crisis === undefined) state.crisis = null;
    if (state.player.consecutiveExamFails == null) state.player.consecutiveExamFails = 0;
    if (!state.goals){
      state.goals = STORY_GOAL_DEFS.map(g => ({ id: g.id, status: 'active', rivalNpcId: null }));
    }
    // Migration : rumeurs, conséquences différées, liens PNJ (v2 -> v3)
    if (!state.rumors) state.rumors = [];
    if (!state.player.pendingConsequences) state.player.pendingConsequences = [];
    (state.npcs || []).forEach(n => { if (!n.bonds) n.bonds = {}; });
    // Migration : rythme/tension par année, arcs de crise à étapes (v3 -> v4)
    if (state.majorCrisisThisYear === undefined) state.majorCrisisThisYear = false;
    // Migration : verrou "un seul lieu de l'école visitable par semaine" (v4 -> v5)
    if (state.player.lastLocationVisit === undefined) state.player.lastLocationVisit = null;
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
    if (!s.stats_meta.uniqueActivitiesUsed) s.stats_meta.uniqueActivitiesUsed = [];
    Object.values(s.planning).forEach(actId => {
      const act = ACTIVITIES[actId];
      if (!act) return;
      Object.entries(act.stats).forEach(([k,v]) => { statTotals[k] = (statTotals[k]||0) + v; });
      if (act.points) pointsGained += act.points;
      if (!s.stats_meta.uniqueActivitiesUsed.includes(actId)) s.stats_meta.uniqueActivitiesUsed.push(actId);
    });
    // bonus passif du club si le joueur a assisté à une activité de club cette semaine
    if (s.player.clubId && Object.values(s.planning).includes('club')){
      const club = getClub(s.player.clubId);
      if (club){
        Object.entries(club.bonus).forEach(([k,v]) => { statTotals[k] = (statTotals[k]||0) + v; });
      }
    }
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
    if (s.player.flags.classDividedWeeksLeft > 0) s.player.flags.classDividedWeeksLeft--;
    s.player.flags.duelsThisWeek = 0;

    // Réintègre les élèves absents dont la période est terminée
    s.npcs.forEach(n => {
      if (n.status === 'absent'){
        n.absentWeeksLeft = (n.absentWeeksLeft || 1) - 1;
        if (n.absentWeeksLeft <= 0) n.status = 'actif';
      }
    });

    // Semaine spéciale imprévue : ne survient jamais en semaine 1 ni 2 d'une année,
    // jamais la même semaine qu'un examen déjà programmé, et de plus en plus souvent
    // à mesure que les années avancent (montée en tension, voir specialWeekChance).
    const scheduledExam = this.getExamForThisWeek();
    let specialWeek = null;
    if (!scheduledExam && s.time.week > 2 && Math.random() < specialWeekChance(s)){
      specialWeek = triggerSpecialWeek(s);
    }
    // Filet de sécurité de dernière année : si à mi-parcours de l'année 3 aucune crise
    // majeure ne s'est encore produite (par malchance du tirage), on en force une.
    if (!specialWeek && !scheduledExam && !s.crisis && s.time.year === MAX_YEARS
        && s.time.week === Math.round(WEEKS_PER_YEAR * 0.6) && !s.majorCrisisThisYear){
      specialWeek = triggerSpecialWeek(s, 'incident');
    }

    // Progression d'une crise durable en cours : arc à étapes si son `kind` est défini
    // dans CRISIS_ARCS, sinon simple décompte inchangé par rapport à avant.
    let crisisStage = null;
    if (s.crisis){
      const arcDef = CRISIS_ARCS[s.crisis.kind];
      if (arcDef){
        s.crisis.weeksUntilNextStage--;
        if (s.crisis.weeksUntilNextStage <= 0){
          if (specialWeek){
            // évite deux modales la même semaine : l'étape est retentée la semaine suivante
            s.crisis.weeksUntilNextStage = 1;
          } else {
            const stageDef = arcDef.stages[s.crisis.stageIndex];
            if (stageDef.choice){
              crisisStage = { arcDef, stageDef, crisis: s.crisis };
            } else {
              addJournalEntry(s, stageDef.narrative(s, s.crisis.data), 'majeur');
              advanceCrisisToNextStage(s, arcDef);
            }
          }
        }
      } else {
        // crise "classique" sans arc défini : comportement inchangé
        s.crisis.weeksLeft--;
        if (s.crisis.weeksLeft <= 0){
          addJournalEntry(s, `La crise (${s.crisis.label}) finit par se résorber. L'ambiance redevient peu à peu normale.`, 'system');
          s.crisis = null;
        }
      }
    }

    const planningResult = (specialWeek && specialWeek.type === 'greve')
      ? { pointsGained: 0, statTotals: {} }
      : this.applyPlanningGains();

    let examResult = null;
    const exam = this.getExamForThisWeek(); // relit : un examen surprise a pu être ajouté à l'instant
    if (exam){
      const entry = s.scheduledExams.find(e => e.week === s.time.week);
      examResult = { exam, surprise: !!(entry && entry.surprise) };
    }

    simulateNpcWeek(s);

    // Répercussions différées de trahisons/corruptions/complots passés, puis vie des rumeurs.
    const consequenceResults = processPendingConsequences(s);
    decayRumors(s);
    maybeSpawnAmbientRumor(s);
    const whiteRoomAlert = updateWhiteRoomWatch(s);
    const loanAlert = updateLoanStatus(s);

    let marriageMoment = null;
    if (!exam && !specialWeek && !crisisStage){ marriageMoment = checkMarriageMoment(s); }

    let weeklyEvent = null;
    if (!exam && !specialWeek && !crisisStage && !marriageMoment){ weeklyEvent = maybeTriggerWeeklyEvent(s); }

    s.time.week++;
    let yearEnded = false;
    if (s.time.week > WEEKS_PER_YEAR){
      yearEnded = true;
      this.endOfYear();
    }
    s.time.season = this.currentSeason();

    const goalsUpdate = this.checkGoalDeadlines();
    const unlockedAchievements = checkAchievements(s);

    SaveManager.save(s);

    return { planningResult, examResult, weeklyEvent, specialWeek, crisisStage, marriageMoment, yearEnded, unlockedAchievements, goalsUpdate, consequenceResults, whiteRoomAlert, loanAlert };
  },

  /** Vérifie chaque objectif à échéance : succès anticipé, ou échec au passage de la date limite. */
  checkGoalDeadlines(){
    const s = this.state;
    const updates = [];
    (s.goals || []).forEach(g => {
      if (g.status !== 'active') return;
      const def = getGoalDef(g.id);
      if (!def) return;

      if (def.checkSuccess(s)){
        g.status = 'success';
        addJournalEntry(s, `Objectif accompli : « ${def.title} »`, 'objectif');
        updates.push({ goal: g, def, outcome: 'success' });
        return;
      }

      const deadlinePassed = (s.time.year > def.deadlineYear)
        || (s.time.year === def.deadlineYear && s.time.week >= def.deadlineWeek);
      if (deadlinePassed){
        g.status = 'failed';
        const rivalPool = s.npcs.filter(n => n.status === 'actif' && n.classId !== 'A' && n.archetype === 'ambitious_leader');
        const fallbackPool = s.npcs.filter(n => n.status === 'actif' && n.classId !== 'A');
        const rival = pick(rivalPool.length ? rivalPool : fallbackPool);
        if (rival){
          rival.classId = 'A';
          g.rivalNpcId = rival.id;
          addJournalEntry(s, `Échéance dépassée : « ${def.title} ». ${rival.fullName} intègre la Classe A à votre place et savoure sa victoire.`, 'majeur');
        } else {
          addJournalEntry(s, `Échéance dépassée : « ${def.title} ».`, 'majeur');
        }
        updates.push({ goal: g, def, outcome: 'failed' });
      }
    });
    return updates;
  },

  /** Traite la fin d'année : classement des classes, promotion/rétrogradation, éventuelle expulsion narrative. */
  endOfYear(){
    const s = this.state;
    // Le classement A > B > C > D est déjà maintenu en temps réel après chaque examen (voir normalizeClassRanking) :
    // à cet instant les lettres reflètent donc déjà exactement l'ordre des points de classe.
    addJournalEntry(s, `Fin de l'année ${s.time.year}. Classement des classes : ${CLASS_IDS.map(c=>'Classe '+c).join(' > ')}.`, 'system');

    // léger reset des points de classe pour la nouvelle année, en gardant un historique relatif
    CLASS_IDS.forEach(c => { s.classPoints[c] = Math.round(s.classPoints[c]*0.6 + 300); });
    // Le reset est une transformation croissante donc l'ordre ne change pas ici, mais on renormalise
    // par sécurité (et pour rester cohérent si cette formule est ajustée plus tard).
    announceRankChanges(s, normalizeClassRanking(s));

    s.time.year++;
    s.time.week = 1;
    s.majorCrisisThisYear = false;

    if (s.time.year > MAX_YEARS){
      s.gameOver = true;
      addJournalEntry(s, `Vous achevez votre parcours à LNHS. Dossier final scellé. ${getEndingFlavor(s)}`, 'system');
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
  const has = SaveManager.exists();
  document.getElementById('btn-continue').disabled = !has;
  const btnExport = document.getElementById('btn-export');
  if (btnExport) btnExport.disabled = !has;
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
  toast('Dossier créé avec succès. Bienvenue à LNHS.', 'good');
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
  document.getElementById('hdr-week').textContent = `${s.time.week}/${WEEKS_PER_YEAR} · An ${s.time.year}`;
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
function goalWeeksRemaining(state, def){
  return (def.deadlineYear - state.time.year) * WEEKS_PER_YEAR + (def.deadlineWeek - state.time.week);
}

/** Panneau des objectifs narratifs à échéance. Seuls les objectifs en cours sont détaillés ;
 *  ceux déjà accomplis ou manqués sont résumés en une ligne pour ne pas encombrer le tableau de bord. */
function goalsPanelHtml(state){
  const goals = state.goals || [];
  if (!goals.length) return '';
  const active = goals.filter(g => g.status !== 'success' && g.status !== 'failed');
  const successCount = goals.filter(g => g.status === 'success').length;
  const failedCount = goals.filter(g => g.status === 'failed').length;

  if (!active.length){
    if (!successCount && !failedCount) return '';
    return `<div class="panel"><div class="panel__title">Objectifs</div>
      <p class="text-dim">Rien en cours pour l'instant. ${successCount ? `${successCount} accompli(s)` : ''}${successCount && failedCount ? ' · ' : ''}${failedCount ? `${failedCount} manqué(s)` : ''} au fil de votre parcours.</p>
    </div>`;
  }

  const rows = active.map(g => {
    const def = getGoalDef(g.id);
    if (!def) return '';
    const weeksLeft = goalWeeksRemaining(state, def);
    return `<div class="event-card"><div class="event-card__title">🎯 ${escapeHtml(def.title)} <span class="event-card__tag">${weeksLeft} sem. restantes</span></div>
      <div class="event-card__desc">${escapeHtml(def.desc)}</div></div>`;
  }).join('');
  const pastNote = (successCount || failedCount)
    ? `<p class="text-faint mt-1" style="font-size:.76rem">Déjà derrière vous : ${successCount ? `${successCount} accompli(s)` : ''}${successCount && failedCount ? ' · ' : ''}${failedCount ? `${failedCount} manqué(s)` : ''}.</p>`
    : '';
  return `<div class="panel"><div class="panel__title">Ce que vous visez en ce moment</div>${rows}${pastNote}</div>`;
}

/** Écran de fin de partie (expulsion ou diplôme après 3 ans) : récap narratif + score détaillé. */
function renderGameOverScreen(){
  const s = Game.state;
  const el = document.getElementById('view-dashboard');
  const expelled = !!s.player.flags.expelled;
  const arrested = !!s.player.flags.arrested;
  const { items, total } = computeFinalScore(s);
  const rank = getScoreRank(total);

  const flavor = arrested
    ? `Ce que vous avez tenté a fini par vous rattraper. Ce n'est plus une affaire d'administration scolaire : votre parcours à LNHS s'achève ici, dans les pires conditions possibles.`
    : expelled
    ? `Votre dossier a été jugé irrécupérable par l'administration. Votre parcours à LNHS s'achève ici, prématurément.`
    : getEndingFlavor(s);

  const romances = getActiveRomances(s).map(id => getNpc(s, id)).filter(Boolean);
  const allies = Object.values(s.player.relationships).filter(r => r.type === 'allié').length;
  const goalsDone = (s.goals||[]).filter(g => g.status === 'success').length;

  const breakdownRows = items.length ? items.map(it => `
    <div class="rank-row">
      <div style="flex:1"><div class="rank-row__name">${escapeHtml(it.label)}</div></div>
      <div class="rank-row__points" style="color:${it.points>=0?'var(--azure)':'#ff5c5c'}">${it.points>0?'+':''}${it.points.toLocaleString('fr-FR')}</div>
    </div>`).join('') : `<div class="empty-state">Aucun point marquant.</div>`;

  el.innerHTML = `
    <h2 class="section-title">${arrested ? 'Dossier clos — Affaire judiciaire' : expelled ? 'Dossier clos — Expulsion' : 'Fin de parcours — Diplôme LNHS'}</h2>
    <div class="panel">
      <div class="panel__title">Récapitulatif</div>
      <p class="text-dim">${escapeHtml(flavor)}</p>
    </div>

    <div class="panel" style="text-align:center">
      <div class="panel__title">Score final</div>
      <div style="font-family:'Playfair Display',serif;font-size:2.6rem;font-weight:800;color:${rank.color}">${total.toLocaleString('fr-FR')} pts</div>
      <div class="tag" style="margin-top:.4rem">${rank.label}</div>
    </div>

    <div class="kpi-row">
      <div class="kpi"><div class="kpi__label">Classe finale</div><div class="kpi__value" style="color:${CLASS_COLOR[s.player.classId]}">${s.player.classId}</div></div>
      <div class="kpi"><div class="kpi__label">Points personnels</div><div class="kpi__value">${s.player.points.toLocaleString('fr-FR')}</div></div>
      <div class="kpi"><div class="kpi__label">Réputation</div><div class="kpi__value">${s.player.stats.reputation}</div></div>
      <div class="kpi"><div class="kpi__label">Secrets connus</div><div class="kpi__value">${s.player.knownSecrets.length}</div></div>
      <div class="kpi"><div class="kpi__label">Alliés</div><div class="kpi__value">${allies}</div></div>
      <div class="kpi"><div class="kpi__label">Romance(s)</div><div class="kpi__value">${romances.length}</div></div>
      <div class="kpi"><div class="kpi__label">Objectifs accomplis</div><div class="kpi__value">${goalsDone}/${(s.goals||[]).length}</div></div>
      <div class="kpi"><div class="kpi__label">Accomplissements</div><div class="kpi__value">${s.player.unlockedAchievements.length}/${ACHIEVEMENTS.length}</div></div>
    </div>

    <div class="panel">
      <div class="panel__title">Détail du score</div>
      ${breakdownRows}
    </div>

    <div class="panel">
      <div class="panel__title">Derniers événements marquants</div>
      <div id="dash-journal"></div>
    </div>

    <div class="create-foot" style="margin-top:1rem">
      <button class="btn btn--primary" id="btn-gameover-menu">Retour au menu</button>
    </div>
  `;

  const journalWrap = document.getElementById('dash-journal');
  const entries = s.player.journal.slice(0, 8);
  journalWrap.innerHTML = entries.length ? entries.map(journalEntryHtml).join('') : `<div class="empty-state">Rien à signaler.</div>`;

  const menuBtn = document.getElementById('btn-gameover-menu');
  if (menuBtn){
    menuBtn.addEventListener('click', () => {
      SaveManager.save(s);
      showScreen('screen-menu');
      refreshMenuButtons();
    });
  }
}

function renderDashboard(){
  const s = Game.state;
  const el = document.getElementById('view-dashboard');
  const exam = Game.getExamForThisWeek();
  const examEntry = s.scheduledExams.find(e => e.week === s.time.week);
  const isSurpriseExam = !!(examEntry && examEntry.surprise);
  const nextExamEntry = s.scheduledExams.filter(e => e.week >= s.time.week).sort((a,b)=>a.week-b.week)[0];
  const nextExam = nextExamEntry ? EXAM_LIBRARY.find(e=>e.id===nextExamEntry.examId) : null;

  const alerts = [];
  if (s.crisis) alerts.push(`⚠️ Crise en cours : <strong>${escapeHtml(s.crisis.label)}</strong> — encore ${s.crisis.weeksLeft} semaine(s).`);
  if (s.player.flags.classDividedWeeksLeft > 0) alerts.push(`💢 La classe reste fracturée en clans depuis un échec récent — tensions vives encore ${s.player.flags.classDividedWeeksLeft} semaine(s).`);
  const loan = getLoan(s);
  if (loan.amount > 0) alerts.push(`💸 Dette envers le prêteur sur gages : <strong>${loan.amount} points</strong>, exigibles dans ${loan.dueInWeeks} semaine(s) (École → Prêteur sur gages).`);
  const alertsHtml = alerts.length ? `<div class="alert-banner alert-banner--danger">${alerts.join('<br>')}</div>` : '';

  if (s.gameOver){
    renderGameOverScreen();
    return;
  }

  const club = getClub(s.player.clubId);
  const romances = getActiveRomances(s);
  const statusBits = [
    `Classe <strong style="color:${CLASS_COLOR[s.player.classId]}">${s.time.year}-${s.player.classId}</strong> (${CLASS_LABEL[s.player.classId]}), ${s.classPoints[s.player.classId].toLocaleString('fr-FR')} points cumulés`,
    club ? `membre de ${club.ic} ${club.name}` : `pas encore de club (voir École)`,
    romances.length ? (s.player.flags.relationshipStyle ? RELATIONSHIP_STYLE_LABELS[s.player.flags.relationshipStyle] : `${romances.length} idylle(s) en cours`) : `cœur libre pour l'instant`
  ];

  el.innerHTML = `
    <h2 class="section-title">Bonjour, ${escapeHtml(s.player.name)}.</h2>
    <p class="text-dim" style="margin:-.6rem 0 1.2rem">Semaine ${s.time.week} sur ${WEEKS_PER_YEAR}, ${s.time.season} de l'année ${s.time.year}. ${statusBits.join(' · ')}.</p>
    <div class="week-progress tt" data-tip="Semaine ${s.time.week} sur ${WEEKS_PER_YEAR} de l'année ${s.time.year}/${MAX_YEARS}.">
      <div class="week-progress__fill" style="width:${Math.round((s.time.week-1)/WEEKS_PER_YEAR*100)}%"></div>
    </div>
    ${alertsHtml}

    <div class="panel">
      <div class="panel__title">Cette semaine ${exam ? `<small>${isSurpriseExam ? 'Examen surprise !' : 'Un examen vous attend'}</small>` : ''}</div>
      ${exam ? `
        <div class="event-card">
          <div class="event-card__title">${exam.icon} ${exam.name} <span class="event-card__tag">${isSurpriseExam ? 'surprise' : exam.type}</span></div>
          <div class="event-card__desc">${exam.desc}</div>
        </div>
        <button class="btn btn--primary" id="btn-start-exam" style="width:100%">Se présenter à l'examen</button>
      ` : `
        <p class="text-dim">Rien de programmé cette semaine — profitez-en pour avancer tranquillement, ou ajustez votre planning avant de continuer.</p>
        <button class="btn btn--primary" id="btn-advance-week" style="width:100%">Passer à la semaine suivante</button>
      `}
      ${nextExam ? `<p class="text-faint mt-1" style="font-size:.78rem">Prochain examen à l'horizon : ${nextExam.icon} ${nextExam.name}, semaine ${nextExamEntry.week}.</p>` : ''}
    </div>

    ${goalsPanelHtml(s)}

    <div class="panel">
      <div class="panel__title">Ce qu'on raconte <small>Le journal complet est dans son propre onglet</small></div>
      <div id="dash-journal"></div>
    </div>
  `;

  const journalWrap = document.getElementById('dash-journal');
  const entries = s.player.journal.slice(0, 3);
  journalWrap.innerHTML = entries.length ? entries.map(journalEntryHtml).join('') : `<div class="empty-state">Rien à signaler pour l'instant — c'est calme, pour le moment.</div>`;

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

  (result.consequenceResults || []).forEach(r => {
    toast(r.text, r.kind === 'bad' ? 'bad' : 'good');
  });
  (result.unlockedAchievements || []).forEach(ach => {
    toast(`Objectif débloqué : ${ach.name}`, 'good', 'achievement');
  });
  (result.goalsUpdate || []).forEach(u => {
    if (u.outcome === 'success') toast(`Objectif accompli : ${u.def.title}`, 'good', 'achievement');
    else toast(`Objectif manqué : ${u.def.title}`, 'bad');
  });
  if (result.yearEnded){
    if (Game.state.gameOver){
      toast('Votre dossier à LNHS est désormais scellé.', 'good');
    } else {
      toast(`Nouvelle année scolaire : Année ${Game.state.time.year} !`, 'good');
    }
  }
  if (result.whiteRoomAlert){
    toast(result.whiteRoomAlert, 'bad');
  }
  if (result.loanAlert){
    toast(result.loanAlert, 'bad');
  }

  if (result.specialWeek){
    openSpecialWeekModal(result.specialWeek);
  } else if (result.crisisStage){
    openCrisisStageModal(result.crisisStage);
  } else if (result.marriageMoment){
    openMarriageModal(result.marriageMoment);
  } else if (result.weeklyEvent){
    openEventModal(result.weeklyEvent);
  } else {
    renderCurrentView();
    if (!result.yearEnded) toast('Une nouvelle semaine commence.', 'good');
  }
}

/** Modale informative (sans choix) pour une semaine spéciale imprévue. */
function openSpecialWeekModal(sw){
  openModal({
    eyebrow: 'Semaine spéciale',
    title: sw.title,
    bodyHtml: `<p>${escapeHtml(sw.text)}</p>`,
    closeLabel: 'Continuer'
  });
  renderCurrentView();
}

/** Modale de choix pour l'étape d'un arc de crise en cours (voir CRISIS_ARCS). */
function openCrisisStageModal(payload){
  const { arcDef, stageDef, crisis } = payload;
  const s = Game.state;
  openModal({
    eyebrow: 'Crise en cours — ' + crisis.label,
    title: 'Une décision s\'impose',
    bodyHtml: `<p>${escapeHtml(stageDef.choice.prompt(s, crisis.data))}</p>`,
    choices: stageDef.choice.options.map(opt => ({
      label: opt.label, sub: opt.sub,
      onClick(){
        const resultText = opt.apply(s, crisis.data);
        advanceCrisisToNextStage(s, arcDef);
        SaveManager.save(s);
        renderHeader();
        openModal({
          eyebrow: crisis.label,
          title: 'Résultat',
          bodyHtml: `<p>${escapeHtml(resultText)}</p>`,
          closeLabel: 'Continuer'
        });
        renderCurrentView();
      }
    }))
  });
  renderCurrentView();
}

/** Modale de fin d'année 3 : proposer (ou non) une promesse d'avenir au PNJ avec qui la relation est la plus forte. */
function openMarriageModal(payload){
  const s = Game.state;
  const npc = payload.npc;
  const otherRomances = getActiveRomances(s).filter(id => id !== npc.id);
  const bodyHtml = `<p>Votre parcours à LNHS touche à sa fin. Votre relation avec ${npc.fullName} a traversé ces trois années et n'a jamais paru aussi forte.</p>
    <p>C'est peut-être le moment de lui promettre un avenir commun, au-delà de l'école.${otherRomances.length ? ' Vous devrez alors mettre fin à vos autres histoires en cours.' : ''}</p>`;
  const choices = [
    { label:`Faire à ${npc.fullName} une promesse d'avenir`, sub:'Engagement fort — influence la fin du jeu', onClick(){
        otherRomances.forEach(id => {
          adjustRelation(s, id, { affinity: -30, trust: -30 });
          getRel(s, id).type = 'ex';
        });
        adjustRelation(s, npc.id, { affinity: 10, trust: 10 });
        s.player.flags.marriagePromise = { npcId: npc.id, npcName: npc.fullName };
        addJournalEntry(s, `Vous faites à ${npc.fullName} une promesse d'avenir commun, au terme de ces trois années à LNHS.`, 'majeur');
        finishNpcAction(npc.id, `${npc.fullName} accepte, ému(e). Votre avenir semble désormais lié au sien.`);
      }},
    { label:'Rester libre, sans engagement', sub:'Neutre — rien ne change formellement', onClick(){
        finishNpcAction(npc.id, `Vous préférez ne rien précipiter. Le lien avec ${npc.fullName} reste fort, mais sans promesse formelle.`);
      }}
  ];
  openModal({ eyebrow:'Dernière année — un tournant', title:`Un avenir avec ${npc.fullName} ?`, bodyHtml, choices });
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

/* ---------- MODALE D'EXAMEN (séquence en plusieurs étapes) ---------- */

/** Étape 1 : présentation de l'épreuve et choix de la stratégie initiale. */
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
        currentExamContext = {
          exam, strategy: strat,
          moments: drawExamMoments(),
          idx: 0,
          modifier: 0,
          notes: []
        };
        toast(`Stratégie retenue : ${strat.name}.`, 'good');
        runNextExamMoment();
      }
    }))
  });
}

/** Étape 2 (répétée) : fait vivre au joueur les péripéties tirées au sort pendant l'épreuve. */
function runNextExamMoment(){
  const ctx = currentExamContext;
  const s = Game.state;
  if (ctx.idx >= ctx.moments.length){
    openExamSubmissionModal();
    return;
  }
  const moment = ctx.moments[ctx.idx];
  openModal({
    eyebrow: `${ctx.exam.icon} ${ctx.exam.name} — en cours`,
    title: `${moment.icon} ${moment.title}`,
    bodyHtml: `<p>${escapeHtml(moment.text(s, ctx.exam, ctx.strategy))}</p>`,
    choices: moment.choices.map(choice => ({
      label: choice.label,
      sub: choice.sub,
      onClick(){
        const { delta, note } = choice.effect(s, ctx.exam, ctx.strategy, moment);
        ctx.modifier += (delta || 0);
        if (note) ctx.notes.push(note);
        ctx.idx++;
        runNextExamMoment();
      }
    }))
  });
}

/** Étape 3 : transition avant le verdict, pour marquer une pause dramatique. */
function openExamSubmissionModal(){
  const ctx = currentExamContext;
  const notesHtml = ctx.notes.length
    ? `<p class="mt-1 text-dim">${ctx.notes.map(escapeHtml).join(' ')}</p>`
    : '';
  openModal({
    eyebrow: `${ctx.exam.icon} ${ctx.exam.name}`,
    title: 'Épreuve terminée',
    bodyHtml: `<p>Vous rendez votre travail, épuisé(e) mais fixé(e) sur votre performance.</p>${notesHtml}`,
    choices: [
      { label: 'Découvrir le résultat', sub: 'Le verdict tombe.', onClick(){ finalizeExam(); } }
    ]
  });
}

/** Étape 4 : calcule et affiche le verdict final, avec toutes les conséquences. */
function finalizeExam(){
  const ctx = currentExamContext;
  const { exam, strategy: strat, modifier } = ctx;
  const result = resolveExamStrategy(Game.state, exam, strat, modifier);
  const outcome = applyExamOutcome(Game.state, exam, strat, result);
  // l'examen de la semaine est désormais passé : on le retire de la programmation
  Game.state.scheduledExams = Game.state.scheduledExams.filter(
    e => !(e.examId === exam.id && e.week === Game.state.time.week)
  );
  const newlyUnlocked = checkAchievements(Game.state);
  SaveManager.save(Game.state);
  renderHeader();
  newlyUnlocked.forEach(ach => toast(`Objectif débloqué : ${ach.name}`, 'good', 'achievement'));

  const tierClass = outcome.finalTier === 'echec' ? 'bad' : (outcome.finalTier === 'critique' || outcome.finalTier === 'reussite' ? 'good' : '');
  const stakes = outcome.stakes || {};
  const stakesHtml = stakes.text
    ? `<p class="mt-1" style="color:var(--crimson-soft)">${escapeHtml(stakes.text)}</p>`
    : '';

  const ic = outcome.interClass;
  const interClassResultsHtml = ic ? `
    <div class="mt-2">
      <p class="text-dim" style="margin-bottom:.4rem"><strong>Résultat des 4 classes à cet examen</strong></p>
      ${ic.results.map(r => `
        <div class="rank-row ${r.isPlayerClass ? 'you' : ''}">
          <div class="rank-row__pos${r.rank<=3?` medal medal--${r.rank}`:''}">${r.rank<=3 ? ['🥇','🥈','🥉'][r.rank-1] : r.rank}</div>
          <div><div class="rank-row__name" style="color:${CLASS_COLOR[r.classId]}">Classe ${r.classId}${r.isPlayerClass?' (vous)':''}</div></div>
          <div class="rank-row__points" style="color:${r.pointsDelta>=0?'var(--azure)':'#ff5c5c'}">${r.pointsDelta>=0?'+':''}${r.pointsDelta} pts</div>
        </div>`).join('')}
    </div>` : '';
  const rankChangeHtml = (ic && ic.rankChanges.length)
    ? `<p class="mt-1" style="color:var(--gold-soft)"><strong>Le classement des classes vient de bouger !</strong> Consultez l'onglet Classement pour le détail complet.</p>`
    : '';
  const tensionHtml = (ic && ic.tensionPenalty > 0)
    ? `<p class="mt-1" style="color:var(--crimson-soft)">La tension qui règne dans votre classe a pesé sur ses résultats collectifs à cet examen (−${ic.tensionPenalty} pts).</p>`
    : '';
  const noteMismatchHtml = (result.tier !== outcome.finalTier)
    ? `<p class="mt-1" style="color:var(--gold-soft)">${outcome.classNote < outcome.individualNote
        ? `Votre classe vous a pénalisé : votre prestation personnelle méritait mieux.`
        : `Votre classe vous a porté : elle a compensé une prestation personnelle plus faible.`}</p>`
    : '';
  const notesBreakdownHtml = `
    <div class="mt-2">
      <p class="text-dim" style="margin-bottom:.4rem"><strong>Détail de la note</strong></p>
      <div class="rank-row"><div>Note individuelle</div><div class="rank-row__points">${outcome.individualNote}/20</div></div>
      <div class="rank-row"><div>Note de classe (${outcome.playerRank}${outcome.playerRank===1?'ère':'e'} place à cet examen)</div><div class="rank-row__points">${outcome.classNote}/20</div></div>
      <div class="rank-row you"><div><strong>Note finale</strong></div><div class="rank-row__points"><strong>${outcome.finalNote}/20</strong></div></div>
    </div>
    ${noteMismatchHtml}`;

  openModal({
    eyebrow: exam.name,
    title: stakes.playerExpelled ? 'Expulsion' : outcome.tierData.label,
    bodyHtml: `
      <p>Stratégie choisie : <strong>${escapeHtml(strat.name)}</strong></p>
      <p class="mt-1">Score obtenu : <span class="mono text-gold">${result.score}</span> / difficulté ${exam.difficulty}</p>
      ${notesBreakdownHtml}
      ${stakesHtml}
      ${tensionHtml}
      ${interClassResultsHtml}
      ${rankChangeHtml}
    `,
    resultHtml: stakes.playerExpelled
      ? `<span>${escapeHtml('Votre dossier à LNHS se referme ici.')}</span>`
      : `<span>${escapeHtml(`Points personnels : ${outcome.pointsDelta>=0?'+':''}${outcome.pointsDelta}.${outcome.extraText||''}`)}</span>`,
    closeLabel: stakes.playerExpelled ? 'Consulter le dossier final' : 'Terminer'
  });
  document.getElementById('modal-root').querySelector('.modal-result')?.classList.add(tierClass);
  currentExamContext = null;
  renderCurrentView();
  renderHeader();
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
      <div class="panel__title">Objectifs <small>${s.player.unlockedAchievements.length}/${ACHIEVEMENTS.length} débloqués</small></div>
      <div id="achievement-list" class="grid-cards mt-2"></div>
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

  const achList = document.getElementById('achievement-list');
  achList.innerHTML = ACHIEVEMENTS.map(ach => {
    const unlocked = s.player.unlockedAchievements.includes(ach.id);
    if (unlocked){
      return `<div class="item-card item-card--rare">
        <div class="item-card__head"><span class="item-card__name">🏆 ${ach.name}</span></div>
        <div class="item-card__desc">${escapeHtml(ach.desc)}</div>
      </div>`;
    }
    // Les objectifs cachés restent muets tant qu'ils ne sont pas débloqués ; les objectifs
    // annoncés révèlent leur intitulé pour donner un cap au joueur.
    return `<div class="item-card" style="opacity:.55">
      <div class="item-card__head"><span class="item-card__name">🔒 ${ach.hidden ? 'Objectif caché' : ach.name}</span></div>
      <div class="item-card__desc">${ach.hidden ? 'Ce que vous avez fait pour le débloquer reste, pour l\'instant, un mystère.' : escapeHtml(ach.desc)}</div>
    </div>`;
  }).join('');

  const hist = document.getElementById('exam-history');
  if (!s.player.examHistory.length){
    hist.innerHTML = `<div class="empty-state">Aucun examen passé pour l'instant.</div>`;
  } else {
    hist.innerHTML = s.player.examHistory.slice().reverse().map(h => {
      const exam = EXAM_LIBRARY.find(e => e.id === h.examId);
      // h.finalNote n'existe que pour les examens passés depuis l'introduction de la note individuelle/note
      // de classe ; les entrées plus anciennes (sauvegardes précédentes) n'affichent que le palier.
      const notesDesc = (h.finalNote !== undefined)
        ? `Note individuelle ${h.individualNote}/20 · Note de classe ${h.classNote}/20 (${h.classRank}${h.classRank===1?'ère':'e'} place) · Note finale ${h.finalNote}/20`
        : '';
      return `<div class="event-card">
        <div class="event-card__title">${exam ? exam.icon+' '+exam.name : h.examId} <span class="event-card__tag">${h.tier}</span></div>
        <div class="event-card__desc">Année ${h.year}, semaine ${h.week}${notesDesc ? ' — '+notesDesc : ''}</div>
      </div>`;
    }).join('');
  }
}

/* ---------- VUE : RELATIONS ---------- */
let relationsSortMode = 'affinity_desc';
let classroomMapVisible = false;
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

  const friendNames = getNpcFriends(s, npcId).map(id => getNpc(s, id)).filter(n => n && n.status === 'actif').map(n => n.fullName);
  const rivalNames = getNpcRivalsWeb(s, npcId).map(id => getNpc(s, id)).filter(n => n && n.status === 'actif').map(n => n.fullName);
  const socialHtml = (friendNames.length || rivalNames.length)
    ? `<p class="mt-1"><strong>Dans l'école :</strong> ${friendNames.length ? `proche de ${friendNames.join(', ')}` : ''}${friendNames.length && rivalNames.length ? ' · ' : ''}${rivalNames.length ? `en froid avec ${rivalNames.join(', ')}` : ''}</p>`
    : '';

  const npcRumor = (s.rumors || []).find(r => r.subjectId === npcId);
  const rumorHtml = npcRumor ? `<p><strong>Rumeur en cours :</strong> ${npc.fullName} ${escapeHtml(npcRumor.text)}.</p>` : '';

  const partner = npc.partnerId ? getNpc(s, npc.partnerId) : null;
  const coupleHtml = (partner && partner.status === 'actif') ? `<p><strong>Statut sentimental :</strong> en couple avec ${partner.fullName}.</p>` : '';

  const wr = ensureWhiteRoomState(s);
  const isExposedMole = wr.active && wr.npcId === npcId && wr.stage === 'exposed';
  const isDefeatedMole = wr.active && wr.npcId === npcId && wr.stage === 'resolved';
  const whiteRoomHtml = isExposedMole
    ? `<p class="mt-1" style="color:#ff5c5c"><strong>⚠ Dossier occulte :</strong> cette personne dissimule des aptitudes réelles bien supérieures à ce qu'elle laisse paraître (Intelligence ${npc.whiteRoomTrueStats.intelligence}, Sang-froid ${npc.whiteRoomTrueStats.sangFroid}, Influence ${npc.whiteRoomTrueStats.influence}...). Elle vous observe depuis un moment.</p>`
    : isDefeatedMole
      ? `<p class="mt-1"><strong>Dossier occulte :</strong> vous savez ce qu'elle cache vraiment — mais elle a cessé de s'intéresser à vous.</p>`
      : '';

  const pendingDate = getPendingDateForNpc(s, npcId);
  const pendingDateHtml = pendingDate
    ? `<p><strong>Rendez-vous planifié :</strong> ${DATE_LOCATIONS[pendingDate.data.locationId].label} · ${DATE_ACTIVITIES[pendingDate.data.activityId].label} (semaine ${pendingDate.dueWeek}).</p>`
    : '';

  const bodyHtml = `
    <div class="flex-between"><span class="tag">Classe ${npc.classId}</span><span class="tag">${npc.archetypeLabel}</span></div>
    <p class="mt-1"><strong>Traits :</strong> ${npc.traits.join(', ')}</p>
    <p><strong>Ambition :</strong> ${escapeHtml(npc.ambition)}</p>
    <p><strong>Relation :</strong> <span style="color:${relColor(rel.type)}">${rel.type}</span> (affinité ${rel.affinity}, confiance ${rel.trust}, peur ${rel.fear})</p>
    <p><strong>Secret :</strong> ${knowsSecret ? escapeHtml(npc.secret.text) : 'Inconnu — enquêtez pour le découvrir.'}</p>
    ${whiteRoomHtml}
    ${coupleHtml}
    ${pendingDateHtml}
    ${socialHtml}
    ${rumorHtml}
    ${memoryHtml}
  `;

  // Une relation ouvertement hostile (ennemi/rival) interdit tout ce qui relève
  // du rapprochement volontaire : passer du temps ensemble, rendez-vous, alliance.
  // Seuls le dialogue (qui peut rester froid ou hostile), l'enquête et la
  // corruption restent cohérents avec ce type de relation.
  const isHostileRelation = (rel.type === 'ennemi' || rel.type === 'rival');

  const choices = [
    { label:'Discuter', sub:'Choisir un sujet et un ton — issue variable', onClick(){
        openDialogueModal(npcId);
      }}
  ];
  if (!isHostileRelation){
    choices.push({ label:'Passer du temps ensemble', sub:'+affinité, +confiance', onClick(){
        adjustRelation(s, npcId, { affinity: rndInt(4,9), trust: rndInt(2,5) });
        finishNpcAction(npcId, `Vous passez un bon moment avec ${npc.fullName}.`);
      }});
  }
  choices.push(
    { label:'Enquêter sur son secret', sub:'Dépend de l\'influence et de la chance', onClick(){
        const success = investigateSecret(s, npcId);
        finishNpcAction(npcId, success ? `Vous découvrez quelque chose sur ${npc.fullName}.` : `Votre enquête sur ${npc.fullName} échoue.`);
      }}
  );
  if (!isHostileRelation){
    choices.push({ label:'Proposer une alliance', sub:'Nécessite une affinité suffisante', onClick(){
        const success = formAlliance(s, npcId);
        finishNpcAction(npcId, success ? `Alliance formée avec ${npc.fullName} !` : `${npc.fullName} refuse votre alliance.`);
      }});
  }
  choices.push(
    { label:'Corrompre (200 pts)', sub:'Achète un service ou une faveur', onClick(){
        const res = bribeNpc(s, npcId, 200);
        finishNpcAction(npcId, res.success ? `${npc.fullName} accepte votre offre.` : `${npc.fullName} refuse et se méfie.`);
      }}
  );
  if (npc.status === 'actif'){
    const remaining = duelsRemainingThisWeek(s);
    choices.push({ label:`Défier en duel${remaining <= 0 ? ' (limite atteinte)' : ''}`, sub:`Force, intelligence ou charisme — mise de ${DUEL_STAKE} pts`, onClick(){
        if (remaining <= 0){ toast('Vous avez déjà relevé trop de défis cette semaine.', 'bad'); return; }
        openDuelDomainModal(npcId);
      }});
  }
  if (!pendingDate && !isHostileRelation && rel.affinity >= 25 && npc.status === 'actif'){
    choices.push({ label:'Planifier un rendez-vous', sub:'Choisir un lieu puis une activité pour la semaine prochaine', onClick(){
      openDateLocationModal(npcId);
    }});
  }
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
  if (canBeManipulatedIntoFraming(s, npcId)){
    choices.push({ label:'Le/la pousser à accuser un(e) camarade', sub:'Peut faire exclure la cible — risque de retournement si ça échoue', onClick(){
      openFrameTargetPicker(npcId);
    }});
  }
  if (partner && partner.status === 'actif'){
    choices.push({ label:`Briser son couple avec ${partner.fullName}`, sub:'Manipulation sociale — risque de retournement si ça échoue', onClick(){
      confirmAction({
        eyebrow: 'Manipulation sociale',
        title: `Briser le couple de ${npc.fullName} ?`,
        text: `Vous allez tenter de semer la discorde entre ${npc.fullName} et ${partner.fullName}. En cas d'échec, les deux se méfieront durablement de vous.`,
        confirmLabel: 'Tenter la manœuvre',
        danger: true,
        onConfirm(){
          const res = attemptBreakupCouple(s, npcId);
          finishNpcAction(npcId, res.text);
        }
      });
    }});
  }
  if (knowsSecret && npc.status === 'actif'){
    choices.push({ label:'Lancer une campagne de destruction sociale', sub:'Rumeurs + pression pour le/la pousser à quitter LNHS — risque élevé', onClick(){
      confirmAction({
        eyebrow: 'Manipulation extrême',
        title: `Détruire socialement ${npc.fullName} ?`,
        text: `Vous allez orchestrer une campagne de rumeurs destinée à isoler ${npc.fullName} au point de le/la pousser à quitter l'école. Un échec se retournera durement contre votre réputation.`,
        confirmLabel: 'Lancer la campagne',
        danger: true,
        onConfirm(){
          const res = attemptSocialDestruction(s, npcId);
          finishNpcAction(npcId, res.text);
        }
      });
    }});
  }
  if (canAttemptElimination(s, npcId)){
    const perfectBuild = isPerfectEliminationBuild(s);
    choices.push({
      label: `Aller jusqu'au bout avec ${npc.fullName}`,
      sub: perfectBuild
        ? 'Votre maîtrise est totale — pour une fois, l\'issue ne tient plus au hasard'
        : 'Option extrême et quasi désespérée — un échec met fin à la partie',
      onClick(){
        confirmAction({
          eyebrow: '⚠ Point de non-retour',
          title: `Tenter de faire disparaître ${npc.fullName} ?`,
          text: perfectBuild
            ? `Il n'y a plus de retour en arrière possible après ça. Mais avec la maîtrise absolue que vous avez atteinte (sang-froid, influence, chance et intelligence tous au maximum), rien n'est laissé au hasard : cette tentative-ci ne peut pas échouer. Confirmez-vous ?`
            : `Il n'y a plus de retour en arrière possible après ça. Vos chances de vous en sortir sont extrêmement faibles — la quasi-totalité des tentatives se retournent contre vous et mettent fin immédiatement à votre parcours à LNHS, dans les pires conditions. Êtes-vous certain(e) de vouloir prendre ce risque ?`,
          confirmLabel: 'Prendre le risque, quoi qu\'il en coûte',
          danger: true,
          onConfirm(){
            const res = attemptEliminate(s, npcId);
            finishNpcAction(npcId, res.text);
          }
        });
      }
    });
  }
  if (isExposedMole){
    choices.push({ label:`Confronter ${npc.fullName} à propos de la White Room`, sub:'Affrontement final — issue incertaine, ne rien garantir', onClick(){
      confirmAction({
        eyebrow: 'Confrontation',
        title: `Affronter ${npc.fullName} ouvertement ?`,
        text: `Vous savez désormais ce que ${npc.fullName} cache. Le/la confronter directement est un pari : soit vous forcez le respect, soit vous êtes écrasé(e) sans ménagement.`,
        confirmLabel: 'Confronter',
        danger: true,
        onConfirm(){
          const res = confrontWhiteRoom(s);
          finishNpcAction(npcId, res.text);
        }
      });
    }});
  }

  openModal({ eyebrow: 'Dossier élève', title: npc.fullName, bodyHtml, choices });
}

/** Modale : choix du lieu d'un rendez-vous planifié avec un PNJ. */
function openDateLocationModal(npcId){
  const s = Game.state;
  const npc = getNpc(s, npcId);
  const bodyHtml = `<p>Où souhaitez-vous emmener ${npc.fullName} ?</p>`;
  const choices = Object.entries(DATE_LOCATIONS).map(([id, loc]) => ({
    label: `${loc.ic} ${loc.label}${loc.costPoints ? ` (${loc.costPoints} pts)` : ''}`,
    sub: loc.desc + (loc.exposed ? ' ⚠️ Vous risquez d\'être vu(e).' : ''),
    onClick(){ openDateActivityModal(npcId, id); }
  }));
  openModal({ eyebrow: npc.fullName, title: 'Planifier un rendez-vous — le lieu', bodyHtml, choices });
}

/** Modale : choix de l'activité du rendez-vous, puis confirmation et planification effective. */
function openDateActivityModal(npcId, locationId){
  const s = Game.state;
  const npc = getNpc(s, npcId);
  const loc = DATE_LOCATIONS[locationId];
  const bodyHtml = `<p>Que ferez-vous ensemble, à ${loc.label.toLowerCase()} ?</p>`;
  const choices = Object.entries(DATE_ACTIVITIES).map(([id, act]) => ({
    label: `${act.ic} ${act.label}${act.costPoints ? ` (${act.costPoints} pts)` : ''}`,
    sub: act.desc,
    onClick(){
      const res = scheduleDate(s, npcId, locationId, id);
      if (!res.ok){
        toast(res.reason === 'points' ? 'Pas assez de points pour ce rendez-vous.' : 'Impossible de planifier ce rendez-vous.', 'bad');
        return;
      }
      finishNpcAction(npcId, `Rendez-vous planifié avec ${npc.fullName} pour la semaine prochaine : ${loc.label} · ${act.label}.`);
    }
  }));
  openModal({ eyebrow: npc.fullName, title: 'Planifier un rendez-vous — l\'activité', bodyHtml, choices });
}

/** Modale : choix du sujet de conversation, filtré selon les sujets disponibles pour ce PNJ. */
function openDialogueModal(npcId){
  const s = Game.state;
  const npc = getNpc(s, npcId);
  const topics = DIALOGUE_TOPICS.filter(t => { try { return t.available(s, npc); } catch(e){ return true; } });
  const bodyHtml = `<p>De quoi voulez-vous parler avec ${npc.fullName} ?</p>`;
  const choices = topics.map(topic => ({
    label: topic.label,
    onClick(){ openDialogueApproachModal(npcId, topic.id); }
  }));
  openModal({ eyebrow: npc.fullName, title: 'Discuter', bodyHtml, choices });
}

/** Modale : choix du ton (approche) pour le sujet sélectionné, puis exécution et affichage du résultat. */
function openDialogueApproachModal(npcId, topicId){
  const s = Game.state;
  const npc = getNpc(s, npcId);
  const topic = DIALOGUE_TOPICS.find(t => t.id === topicId);
  const bodyHtml = `<p>Quel ton adopter ?</p>`;
  const choices = topic.approaches.map(approach => ({
    label: approach.label, sub: approach.sub,
    onClick(){
      const text = runDialogue(s, npc, topic, approach);
      finishNpcAction(npcId, text);
    }
  }));
  openModal({ eyebrow: `${npc.fullName} — ${topic.label}`, title: 'Choisir un ton', bodyHtml, choices });
}

/** Modale de sélection de cible pour manipuler un(e) élève ("pion") vers une fausse accusation. */
function openFrameTargetPicker(pawnId){
  const s = Game.state;
  const pawn = getNpc(s, pawnId);
  const targets = s.npcs.filter(n => n.id !== pawnId && n.status === 'actif');
  if (!targets.length){
    openModal({ eyebrow: pawn.fullName, title:'Aucune cible disponible', bodyHtml:`<p>Il n'y a personne à accuser pour l'instant.</p>`, closeLabel:'Fermer' });
    return;
  }
  const bodyHtml = `<p>Choisissez la personne que ${pawn.fullName} ira accuser auprès de l'administration. Un secret déjà connu sur la cible renforce nettement l'accusation.</p>`;
  const choices = targets.map(t => {
    const tRel = getRel(s, t.id);
    const hasSecret = s.player.knownSecrets.includes(t.id);
    return {
      label: `${t.fullName}${hasSecret ? ' 🔓' : ''}`,
      sub: `${tRel.type}${hasSecret ? ' · secret exploitable' : ''}`,
      onClick(){
        confirmAction({
          eyebrow: 'Complot',
          title: `Monter ${pawn.fullName} contre ${t.fullName} ?`,
          text: `Si ${pawn.fullName} accepte et que l'accusation tient, ${t.fullName} risque l'exclusion pure et simple de LNHS. Si le complot échoue, ${pawn.fullName} peut se retourner contre vous et votre réputation en pâtira lourdement.`,
          confirmLabel: 'Lancer le complot',
          danger: true,
          onConfirm(){
            const res = attemptFrameUp(s, pawnId, t.id);
            SaveManager.save(s);
            renderHeader();
            const newlyUnlocked = checkAchievements(s);
            newlyUnlocked.forEach(ach => toast(`Objectif débloqué : ${ach.name}`, 'good', 'achievement'));
            openModal({ eyebrow:'Résultat du complot', title: t.fullName, bodyHtml:`<p>${escapeHtml(res.text)}</p>`, closeLabel:'Continuer' });
            renderCurrentView();
          }
        });
      }
    };
  });
  openModal({ eyebrow: `Manipuler ${pawn.fullName}`, title:'Choisir une cible', bodyHtml, choices });
}

/** Modale de choix du domaine de duel (force / intelligence / charisme) avant résolution. */
function openDuelDomainModal(npcId){
  const s = Game.state;
  const npc = getNpc(s, npcId);
  const bodyHtml = `<p>Choisissez le terrain sur lequel affronter ${npc.fullName}. La mise est de ${DUEL_STAKE} points : à gagner en cas de victoire, à perdre en cas de défaite.</p>`;
  const choices = Object.entries(DUEL_DOMAINS).map(([domain, def]) => ({
    label: `${def.ic} ${def.label}`,
    sub: `${def.desc} (Votre ${STAT_LABELS[def.statKey]} : ${s.player.stats[def.statKey]} vs ${npc.stats[def.statKey]})`,
    onClick(){
      const res = attemptDuel(s, npcId, domain);
      SaveManager.save(s);
      renderHeader();
      const newlyUnlocked = checkAchievements(s);
      openModal({ eyebrow: res.win ? 'Victoire' : 'Défaite', title: def.label, bodyHtml:`<p>${escapeHtml(res.text)}</p>`, closeLabel:'Continuer' });
      newlyUnlocked.forEach(ach => toast(`Objectif débloqué : ${ach.name}`, 'good', 'achievement'));
      renderCurrentView();
    }
  }));
  openModal({ eyebrow: `Défier ${npc.fullName}`, title:'Choisir un domaine', bodyHtml, choices });
}

/** Modale du prêteur sur gages : emprunter (si aucune dette) ou rembourser (si dette en cours). */
function openMoneyLenderModal(){
  const s = Game.state;
  const loan = getLoan(s);

  if (loan.amount > 0){
    const bodyHtml = `
      <p>Vous devez actuellement <strong>${loan.amount} points</strong>, exigibles dans <strong>${loan.dueInWeeks} semaine${loan.dueInWeeks>1?'s':''}</strong>.</p>
      <p class="text-dim">En cas de retard, le prêteur se sert de force sur vos points disponibles — et la dette s'alourdit si elle n'est pas couverte intégralement.</p>
    `;
    const choices = [
      { label:'Rembourser intégralement', sub:`${loan.amount} points`, onClick(){
          const res = repayLoan(s);
          SaveManager.save(s);
          renderHeader();
          const newlyUnlocked = res.success ? checkAchievements(s) : [];
          openModal({ eyebrow:'Prêteur sur gages', title: res.success ? 'Dette soldée' : 'Impossible', bodyHtml:`<p>${escapeHtml(res.text)}</p>`, closeLabel:'Continuer' });
          newlyUnlocked.forEach(ach => toast(`Objectif débloqué : ${ach.name}`, 'good', 'achievement'));
          renderCurrentView();
        }},
      { label:'Repartir', sub:'Ne rien faire pour l\u2019instant', onClick(){ renderCurrentView(); } }
    ];
    openModal({ eyebrow:'Prêteur sur gages', title:'Dette en cours', bodyHtml, choices });
    return;
  }

  const bodyHtml = `<p>Un prêteur discret, installé en marge du campus, propose des avances contre intérêts. Aucune garantie n'est demandée — mais il n'oublie jamais une échéance.</p>`;
  const choices = LOAN_OFFERS.map(offer => ({
    label: `Emprunter ${offer.principal} pts`,
    sub: `À rembourser : ${Math.round(offer.principal*offer.rate)} pts sous ${offer.weeks} semaines`,
    onClick(){
      const res = takeLoan(s, offer);
      SaveManager.save(s);
      renderHeader();
      openModal({ eyebrow:'Prêteur sur gages', title: res.success ? 'Prêt accordé' : 'Refusé', bodyHtml:`<p>${escapeHtml(res.text)}</p>`, closeLabel:'Continuer' });
      renderCurrentView();
    }
  }));
  choices.push({ label:'Repartir', sub:'Ne rien emprunter', onClick(){ renderCurrentView(); } });
  openModal({ eyebrow:'Prêteur sur gages', title:'Contracter un prêt', bodyHtml, choices });
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
    <div class="panel">
      <div class="panel__title flex-between">
        <span>Carte sociale de la classe</span>
        <button class="btn btn--ghost" id="btn-toggle-social-map" style="padding:.3rem .8rem;font-size:.75rem">${classroomMapVisible ? 'Masquer' : 'Afficher'}</button>
      </div>
      ${classroomMapVisible ? `<div id="classroom-social-map"></div>` : `<p class="text-dim">Qui est proche de qui, qui se déteste — vos liens et ceux qui existent entre vos camarades, indépendamment de vous.</p>`}
    </div>
    <div class="grid-cards mt-2" id="classroom-list"></div>
  `;
  const list = document.getElementById('classroom-list');
  list.innerHTML = classmates.map(n => npcCardHtml(s, n)).join('');
  list.querySelectorAll('.npc-card').forEach(card => card.addEventListener('click', () => openNpcModal(card.dataset.npc)));

  const toggleBtn = document.getElementById('btn-toggle-social-map');
  if (toggleBtn) toggleBtn.addEventListener('click', () => { classroomMapVisible = !classroomMapVisible; renderClassroomView(); });
  if (classroomMapVisible) mountSocialMap('classroom-social-map', s, s.player.classId);
}

function npcCardHtml(s, n){
  const rel = getRel(s, n.id);
  const knowsSecret = s.player.knownSecrets.includes(n.id);
  return `
    <div class="npc-card" data-npc="${n.id}">
      <div class="npc-card__badges">
        ${n.allianceId ? '<span class="badge-dot" title="En alliance" style="background:#ffb347"></span>' : ''}
        ${knowsSecret ? '<span class="badge-dot" title="Secret connu" style="background:#ff5c5c"></span>' : ''}
        ${s.rumors && s.rumors.some(r => r.subjectId === n.id) ? '<span class="badge-dot" title="Une rumeur circule" style="background:#b39ddb"></span>' : ''}
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

/* ---------- CARTE SOCIALE (graphe des cliques / rivalités d'une classe) ---------- */

/** Construit le SVG d'une carte sociale : élèves d'une classe en cercle, joueur au centre, liens colorés. */
function classSocialMapSvg(state, classId){
  const classmates = state.npcs.filter(n => n.classId === classId && n.status === 'actif');
  if (classmates.length < 2){
    return `<div class="empty-state">Pas assez de camarades actifs pour dessiner une carte sociale.</div>`;
  }

  const W = 580, H = 440, cx = W / 2, cy = H / 2 + 6, R = Math.min(W, H) / 2 - 78;
  const isPlayerClass = classId === state.player.classId;
  const nodePos = {};
  classmates.forEach((n, i) => {
    const angle = (Math.PI * 2 * i / classmates.length) - Math.PI / 2;
    nodePos[n.id] = { x: cx + R * Math.cos(angle), y: cy + R * Math.sin(angle) };
  });

  // liens entre élèves (amitiés / rivalités), un seul trait par paire même si asymétrique
  const seenPairs = new Set();
  const npcEdges = [];
  classmates.forEach(n => {
    Object.entries(n.bonds || {}).forEach(([otherId, v]) => {
      if (!nodePos[otherId]) return;
      const key = [n.id, otherId].sort().join('|');
      if (seenPairs.has(key) || Math.abs(v) < 28) return;
      seenPairs.add(key);
      npcEdges.push({ a: n.id, b: otherId, v });
    });
  });

  const edgeSvg = npcEdges.map(e => {
    const p1 = nodePos[e.a], p2 = nodePos[e.b];
    const color = e.v > 0 ? '#2fbf8f' : '#ff5c5c';
    const width = clamp(1 + Math.abs(e.v) / 32, 1, 4.2);
    return `<line x1="${p1.x.toFixed(1)}" y1="${p1.y.toFixed(1)}" x2="${p2.x.toFixed(1)}" y2="${p2.y.toFixed(1)}" stroke="${color}" stroke-width="${width.toFixed(2)}" stroke-opacity="0.5"/>`;
  }).join('');

  // liens joueur -> élèves de sa propre classe uniquement (le joueur n'a pas de lien direct affiché avec les autres classes)
  let playerEdgeSvg = '', playerNodeSvg = '';
  if (isPlayerClass){
    const playerP = { x: cx, y: cy };
    const playerLines = classmates.map(n => {
      const rel = getRel(state, n.id);
      if (rel.type === 'inconnu' && Math.abs(rel.affinity) < 15) return '';
      const p = nodePos[n.id];
      const color = relColor(rel.type);
      const width = clamp(1 + Math.abs(rel.affinity) / 30, 1, 4.2);
      return `<line x1="${playerP.x}" y1="${playerP.y}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" stroke="${color}" stroke-width="${width.toFixed(2)}" stroke-opacity="0.65"/>`;
    }).join('');
    playerEdgeSvg = playerLines;
    playerNodeSvg = `
      <g>
        <circle cx="${playerP.x}" cy="${playerP.y}" r="24" fill="var(--gold)" fill-opacity="0.22" stroke="var(--gold)" stroke-width="2.5"/>
        <text x="${playerP.x}" y="${playerP.y + 5}" text-anchor="middle" font-size="18">${state.player.avatar}</text>
      </g>`;
  }

  const nodeSvg = classmates.map(n => {
    const p = nodePos[n.id];
    const rel = getRel(state, n.id);
    const ring = isPlayerClass ? relColor(rel.type) : 'var(--panel-border)';
    return `
      <g class="social-node" data-npc="${n.id}">
        <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="19" fill="${CLASS_COLOR[n.classId]}" fill-opacity="0.16" stroke="${ring}" stroke-width="2"/>
        <text x="${p.x.toFixed(1)}" y="${(p.y + 4).toFixed(1)}" text-anchor="middle" font-size="15">${n.avatar}</text>
        <text x="${p.x.toFixed(1)}" y="${(p.y + 32).toFixed(1)}" text-anchor="middle" font-size="9" fill="var(--text-faint)">${escapeHtml(n.firstName)}</text>
      </g>`;
  }).join('');

  return `
    <svg viewBox="0 0 ${W} ${H}" class="social-map-svg">
      ${edgeSvg}
      ${playerEdgeSvg}
      ${nodeSvg}
      ${playerNodeSvg}
    </svg>
    <div class="social-map-legend">
      <span><i style="background:#2fbf8f"></i>Amitié entre élèves</span>
      <span><i style="background:#ff5c5c"></i>Rivalité entre élèves</span>
      ${isPlayerClass ? `<span><i style="background:var(--gold)"></i>Votre lien avec eux</span>` : ''}
    </div>
  `;
}

/** Injecte la carte sociale dans un conteneur donné et branche les clics sur les nœuds. */
function mountSocialMap(containerId, state, classId){
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = classSocialMapSvg(state, classId);
  el.querySelectorAll('.social-node').forEach(node => {
    node.addEventListener('click', () => openNpcModal(node.dataset.npc));
  });
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
    }},
  { id:'computerroom', ic:'💻', name:'Salle informatique', desc:'Fouiller discrètement les réseaux internes de l\'école', action(state){
      const chance = clamp(0.25 + state.player.stats.influence/220 + state.player.stats.chance/260, 0.08, 0.75);
      if (Math.random() < chance){
        const pool = state.npcs.filter(n => !state.player.knownSecrets.includes(n.id) && n.status==='actif');
        if (pool.length){
          const t = pick(pool);
          state.player.knownSecrets.push(t.id);
          state.stats_meta.secretsDiscovered++;
          bumpStyle(state, 'discret', 2);
          addJournalEntry(state, `En fouillant les archives numériques, vous découvrez un secret sur ${t.fullName}.`, 'secret');
          return `Vous accédez à des fichiers mal protégés et découvrez un secret sur ${t.fullName}.`;
        }
      }
      state.player.stats.influence = clamp(state.player.stats.influence + 1, 0, 100);
      return "Vous ne trouvez rien de compromettant, mais affinez votre maîtrise du système. Influence +1.";
    }},
  { id:'garden', ic:'🌸', name:'Jardin secret', desc:'Un coin tranquille, loin de l\'agitation', action(state){
      state.player.stats.sangFroid = clamp(state.player.stats.sangFroid + 1, 0, 100);
      if (Math.random() < clamp(0.2 + state.player.stats.chance/240, 0.1, 0.55)){
        const bonus = rndInt(40, 110);
        state.player.points += bonus;
        return `Un moment de calme salutaire (Sang-froid +1), et vous trouvez même ${bonus} points personnels égarés par un élève négligent.`;
      }
      return "Un moment de calme salutaire, loin des regards. Sang-froid +1.";
    }},
  { id:'council', ic:'🏵️', name:'Bureau du conseil des élèves', desc:'Tenter d\'obtenir un siège au conseil, ou exercer vos fonctions', action(state){
      if (state.player.flags.studentCouncil){
        state.player.stats.influence = clamp(state.player.stats.influence + 2, 0, 100);
        state.player.stats.reputation = clamp(state.player.stats.reputation + 1, 0, 100);
        return "En tant que membre du conseil, vous traitez quelques dossiers administratifs. Influence +2, Réputation +1.";
      }
      if (state.player.stats.reputation < 45){
        return "Le conseil des élèves reste fermé aux dossiers jugés trop peu réputés pour l'instant. Revenez avec plus de réputation.";
      }
      const chance = clamp(0.25 + state.player.stats.reputation/200 + state.player.stats.charisme/240, 0.1, 0.8);
      if (Math.random() < chance){
        state.player.flags.studentCouncil = true;
        state.player.stats.influence = clamp(state.player.stats.influence + 4, 0, 100);
        bumpStyle(state, 'leader', 4);
        addJournalEntry(state, `Vous obtenez un siège au conseil des élèves.`, 'majeur');
        return "Votre candidature est retenue ! Vous siégez désormais au conseil des élèves. Influence +4.";
      }
      state.player.stats.reputation = clamp(state.player.stats.reputation - 2, 0, 100);
      return "Votre candidature est rejetée cette fois. Réputation -2.";
    }},
  { id:'blackmarket', ic:'🕶️', name:'Marché noir', desc:'Tenter un pari risqué avec vos points personnels (100 points)', action(state){
      const stake = 100;
      if (state.player.points < stake) return "Vous n'avez pas assez de points pour tenter votre chance ici (100 requis).";
      state.player.points -= stake;
      const chance = clamp(0.32 + state.player.stats.chance/220 + state.player.stats.sangFroid/300, 0.1, 0.75);
      if (Math.random() < chance){
        const gain = rndInt(220, 380);
        state.player.points += gain;
        state.stats_meta.blackMarketWins = (state.stats_meta.blackMarketWins || 0) + 1;
        bumpStyle(state, 'manipulateur', 2);
        return `Le pari paie : vous récupérez ${gain} points au total.`;
      }
      if (Math.random() < 0.3){
        state.player.stats.reputation = clamp(state.player.stats.reputation - rndInt(3,8), 0, 100);
        return "Le pari échoue et votre présence ici n'est pas passée inaperçue. Réputation en baisse.";
      }
      return "Le pari échoue. Vos 100 points de mise sont perdus, sans autre conséquence.";
    }},
  { id:'musicroom', ic:'🎵', name:'Salle de musique', desc:'Se détendre en musique et soigner son image', action(state){
      state.player.stats.charisme = clamp(state.player.stats.charisme + 1, 0, 100);
      state.player.stats.popularite = clamp(state.player.stats.popularite + 1, 0, 100);
      if (Math.random() < clamp(0.2 + state.player.stats.charisme/240, 0.1, 0.5)){
        const pool = state.npcs.filter(n => n.classId === state.player.classId && n.status==='actif');
        if (pool.length){
          const t = pick(pool);
          adjustRelation(state, t.id, { affinity: 8, trust: 4 });
          return `Une improvisation musicale attire ${t.fullName}, qui apprécie le moment avec vous. Charisme +1, Popularité +1, relation renforcée.`;
        }
      }
      return "Un moment de détente musicale bienvenu. Charisme +1, Popularité +1.";
    }},
  { id:'shadowlead', ic:'🌑', name:'Enquêter sur l\'observateur', desc:'Chercher qui, dans l\'ombre, semble s\'intéresser à vous', action(state){
      return investigateWhiteRoom(state);
    }},
  { id:'moneylender', ic:'💸', name:'Prêteur sur gages', desc:'Emprunter ou rembourser des points, contre intérêts', action(){ return null; } }
];

/* ----------------------------------------------------------------
   ÉVÉNEMENTS DE LIEU : quand le joueur se rend quelque part, il y a
   désormais une chance réelle qu'il s'y passe quelque chose — une
   rencontre avec un(e) élève, avec un vrai choix à faire et des
   répercussions (relations, réputation, secrets, rumeurs...) —
   plutôt qu'un simple gain de statistique automatique.
   ---------------------------------------------------------------- */

/** Probabilité qu'un événement se déclenche, par lieu (défaut : 0.42). */
const LOCATION_EVENT_CHANCE = {
  cafeteria: 0.55, courtyard: 0.5, library: 0.4, dorms: 0.4, rooftop: 0.45,
  clubroom: 0.48, gym: 0.42, musicroom: 0.4, staffroom: 0.35, computerroom: 0.4,
  garden: 0.35
};

const LOCATION_EVENT_POOL = [
  {
    id: 'loc_ev_table_drama',
    locations: ['cafeteria'],
    title: 'Une place à table',
    text(state, npc){ return `${npc.fullName} vous fait signe de venir vous asseoir à sa table, écartant ostensiblement un autre groupe déjà installé non loin.`; },
    choices: [
      { label: 'Rejoindre sa table', sub: 'Renforce le lien, mais affiche votre camp aux yeux de tous.', apply(state, npc){
          adjustRelation(state, npc.id, { affinity: 10, trust: 6 });
          state.player.stats.popularite = clamp(state.player.stats.popularite + 1, 0, 100);
          rememberNpc(state, npc, "Vous a invité(e) à sa table.");
          return `Vous vous installez avec ${npc.fullName}. La complicité grandit — mais l'autre groupe a remarqué votre choix.`;
        } },
      { label: 'Décliner et rester neutre', sub: 'Aucune prise de parti, aucune avancée.', apply(state, npc){
          adjustRelation(state, npc.id, { affinity: -3 });
          return `Vous préférez ne pas choisir de camp. ${npc.fullName} semble un peu vexé(e).`;
        } },
      { label: 'Proposer de réunir les deux groupes', sub: 'Ambitieux — dépend de votre charisme.', apply(state, npc){
          const success = Math.random() < clamp(0.3 + state.player.stats.charisme/220, 0.15, 0.75);
          if (success){
            state.player.stats.popularite = clamp(state.player.stats.popularite + 3, 0, 100);
            state.player.stats.charisme = clamp(state.player.stats.charisme + 1, 0, 100);
            adjustRelation(state, npc.id, { affinity: 5 });
            bumpStyle(state, 'leader', 2);
            return `Contre toute attente, tout le monde finit à la même table. Votre popularité grimpe nettement.`;
          }
          state.player.stats.reputation = clamp(state.player.stats.reputation - 2, 0, 100);
          return `La tentative tombe à plat, un brin gênante. ${npc.fullName} garde le sourire, mais l'ambiance reste tendue.`;
        } }
    ]
  },
  {
    id: 'loc_ev_group_study',
    locations: ['library'],
    title: 'Petit groupe de révision',
    text(state, npc){ return `${npc.fullName}, visiblement débordé(e), vous demande de l'aide pour rattraper son retard avant le prochain contrôle.`; },
    choices: [
      { label: "L'aider sérieusement", sub: 'Vous perdez du temps, mais le lien se renforce.', apply(state, npc){
          adjustRelation(state, npc.id, { affinity: 9, trust: 8 });
          rememberNpc(state, npc, "Vous a demandé de l'aide en bibliothèque.");
          return `Vous prenez le temps d'expliquer calmement. ${npc.fullName} vous en est sincèrement reconnaissant(e).`;
        } },
      { label: 'Réviser seul, de votre côté', sub: 'Profite pleinement à vos propres résultats.', apply(state, npc){
          state.player.stats.intelligence = clamp(state.player.stats.intelligence + 3, 0, 100);
          adjustRelation(state, npc.id, { affinity: -2 });
          return `Vous restez concentré sur vos propres révisions. Intelligence +3, mais ${npc.fullName} n'oubliera pas ce refus.`;
        } },
      { label: 'Profiter de la situation pour copier discrètement', sub: 'Risqué si quelqu\'un remarque.', apply(state, npc){
          const caught = Math.random() < 0.3;
          if (caught){
            state.player.stats.reputation = clamp(state.player.stats.reputation - rndInt(4, 10), 0, 100);
            adjustRelation(state, npc.id, { affinity: -12, trust: -10 });
            return `${npc.fullName} vous surprend en train de copier son travail sans vergogne. La confiance est brisée.`;
          }
          state.player.stats.intelligence = clamp(state.player.stats.intelligence + 1, 0, 100);
          bumpStyle(state, 'manipulateur', 2);
          return `Personne n'y voit rien. Vous en tirez un petit profit, sans que ${npc.fullName} s'en aperçoive.`;
        } }
    ]
  },
  {
    id: 'loc_ev_confidence',
    locations: ['rooftop', 'garden'],
    title: 'Une confidence',
    text(state, npc, loc){ return `Loin des regards, ${npc.fullName} baisse sa garde et vous confie quelque chose de personnel — visiblement soulagé(e) de pouvoir en parler.`; },
    choices: [
      { label: 'Écouter avec attention', sub: 'Renforce durablement la confiance.', apply(state, npc){
          adjustRelation(state, npc.id, { affinity: 8, trust: 12 });
          rememberNpc(state, npc, "Vous a fait une confidence sincère.");
          return `Vous l'écoutez sans juger. ${npc.fullName} vous fait désormais davantage confiance.`;
        } },
      { label: 'Garder ses distances poliment', sub: 'Neutre, sans conséquence.', apply(state, npc){
          return `Vous restez courtois(e) mais distant(e). ${npc.fullName} n'insiste pas.`;
        } },
      { label: 'Retenir cette information pour plus tard', sub: 'Un secret de plus — au prix de la confiance.', apply(state, npc){
          if (!state.player.knownSecrets.includes(npc.id)) state.player.knownSecrets.push(npc.id);
          state.stats_meta.secretsDiscovered++;
          adjustRelation(state, npc.id, { trust: -6 });
          bumpStyle(state, 'manipulateur', 2);
          return `Vous archivez mentalement chaque détail. Un secret sur ${npc.fullName} de plus dans votre manche.`;
        } }
    ]
  },
  {
    id: 'loc_ev_bullying',
    locations: ['courtyard'],
    title: 'Une scène qui dérape',
    text(state, npc){ return `Un attroupement s'est formé autour de ${npc.fullName}, publiquement humilié(e) par un groupe d'élèves moqueurs.`; },
    choices: [
      { label: 'Intervenir pour le/la défendre', sub: 'Risque un conflit, mais gagne du respect.', apply(state, npc){
          const success = Math.random() < clamp(0.35 + state.player.stats.influence/220 + state.player.stats.force/260, 0.2, 0.8);
          if (success){
            state.player.stats.reputation = clamp(state.player.stats.reputation + 5, 0, 100);
            adjustRelation(state, npc.id, { affinity: 15, trust: 10 });
            rememberNpc(state, npc, "Vous êtes intervenu(e) pour le/la défendre publiquement.");
            return `Votre intervention calme la situation. ${npc.fullName} ne l'oubliera pas, et votre réputation en sort grandie.`;
          }
          state.player.stats.reputation = clamp(state.player.stats.reputation - 3, 0, 100);
          return `Votre intervention tourne court et vous vous retrouvez vous-même sous les moqueries.`;
        } },
      { label: 'Ne rien faire', sub: 'Aucun risque, mais cela se voit.', apply(state, npc){
          adjustRelation(state, npc.id, { affinity: -5 });
          return `Vous détournez le regard. ${npc.fullName} n'a pas manqué de le remarquer.`;
        } },
      { label: 'Se joindre aux moqueries', sub: 'Populaire dans l\'instant, cruel sur la durée.', apply(state, npc){
          state.player.stats.popularite = clamp(state.player.stats.popularite + 3, 0, 100);
          adjustRelation(state, npc.id, { affinity: -25, trust: -20 });
          getRel(state, npc.id).type = 'ennemi';
          bumpStyle(state, 'manipulateur', 3);
          return `Le groupe vous accueille avec des rires. ${npc.fullName}, humilié(e), ne vous le pardonnera pas.`;
        } }
    ]
  },
  {
    id: 'loc_ev_sparring',
    locations: ['gym'],
    title: 'Défi amical',
    text(state, npc){ return `${npc.fullName} vous met au défi d'un round rapide, devant quelques curieux venus observer.`; },
    choices: [
      { label: 'Accepter et donner le maximum', sub: 'Dépend de votre forme physique.', apply(state, npc){
          const success = Math.random() < clamp(0.35 + state.player.stats.force/220 + state.player.stats.endurance/260, 0.2, 0.8);
          if (success){
            state.player.stats.force = clamp(state.player.stats.force + 2, 0, 100);
            state.player.stats.reputation = clamp(state.player.stats.reputation + 2, 0, 100);
            adjustRelation(state, npc.id, { affinity: 4, trust: 2 });
            return `Vous prenez clairement le dessus. ${npc.fullName} reconnaît beau joueur votre supériorité.`;
          }
          adjustRelation(state, npc.id, { affinity: -3 });
          return `${npc.fullName} vous domine sans peine devant les autres. Un peu d'orgueil en moins.`;
        } },
      { label: 'Décliner poliment', sub: 'Aucun risque, aucun gain.', apply(state, npc){
          return `Vous préférez ne pas vous exposer aujourd'hui. ${npc.fullName} n'insiste pas.`;
        } }
    ]
  },
  {
    id: 'loc_ev_club_tension',
    locations: ['clubroom'],
    title: 'Tension au club',
    text(state, npc){ return `Un désaccord éclate au sein du club sur la direction à prendre. ${npc.fullName} attend clairement votre soutien.`; },
    choices: [
      { label: 'Le/la soutenir publiquement', sub: 'Renforce le lien, prend parti ouvertement.', apply(state, npc){
          adjustRelation(state, npc.id, { affinity: 10, trust: 5 });
          state.player.stats.influence = clamp(state.player.stats.influence + 1, 0, 100);
          return `Votre soutien pèse dans la balance. ${npc.fullName} s'en souviendra.`;
        } },
      { label: 'Tenter de réconcilier les deux camps', sub: 'Exigeant, mais valorise le leadership si ça marche.', apply(state, npc){
          const success = Math.random() < clamp(0.3 + state.player.stats.sangFroid/220 + state.player.stats.charisme/260, 0.15, 0.75);
          if (success){
            state.player.stats.reputation = clamp(state.player.stats.reputation + 3, 0, 100);
            bumpStyle(state, 'leader', 3);
            return `Vous parvenez à apaiser les esprits. Le club vous en respecte davantage.`;
          }
          adjustRelation(state, npc.id, { affinity: -4 });
          return `Votre médiation ne convainc personne. La tension reste entière, et ${npc.fullName} semble déçu(e).`;
        } },
      { label: 'Rester en retrait', sub: 'Ne froisse personne, mais ne construit rien.', apply(){ return `Vous laissez le club régler ça sans vous.`; } }
    ]
  },
  {
    id: 'loc_ev_overheard',
    locations: ['staffroom'],
    title: 'Conversation surprise',
    text(state, npc){ return `En traînant près de la salle des professeurs, vous surprenez une conversation compromettante impliquant ${npc.fullName}.`; },
    choices: [
      { label: 'Garder cette information pour vous', sub: 'Un secret de plus, aucune relation affectée.', apply(state, npc){
          if (!state.player.knownSecrets.includes(npc.id)) state.player.knownSecrets.push(npc.id);
          state.stats_meta.secretsDiscovered++;
          return `Vous notez discrètement ce que vous venez d'entendre sur ${npc.fullName}.`;
        } },
      { label: "L'avertir de ce que vous avez entendu", sub: 'Gagne sa confiance, prend un risque.', apply(state, npc){
          adjustRelation(state, npc.id, { affinity: 12, trust: 10 });
          rememberNpc(state, npc, "Vous l'avez averti(e) d'une conversation compromettante.");
          return `${npc.fullName} vous remercie sincèrement de l'avoir prévenu(e).`;
        } },
      { label: 'Laisser filer, ça ne vous regarde pas', sub: 'Neutre.', apply(){ return `Vous continuez votre chemin sans vous en mêler.`; } }
    ]
  },
  {
    id: 'loc_ev_dorm_conflict',
    locations: ['dorms'],
    title: 'Conflit de chambrée',
    text(state, npc){ return `Une dispute éclate dans le couloir des dortoirs, et ${npc.fullName} vous prend à partie pour trancher.`; },
    choices: [
      { label: 'Apaiser calmement la situation', sub: 'Repose sur votre sang-froid.', apply(state, npc){
          const success = Math.random() < clamp(0.35 + state.player.stats.sangFroid/220, 0.2, 0.8);
          if (success){
            state.player.stats.sangFroid = clamp(state.player.stats.sangFroid + 2, 0, 100);
            adjustRelation(state, npc.id, { affinity: 6, trust: 5 });
            return `Votre calme retombe sur tout le couloir. ${npc.fullName} vous en sait gré.`;
          }
          return `Vos tentatives d'apaisement n'y font rien, la dispute continue sans vous.`;
        } },
      { label: 'Prendre parti pour lui/elle', sub: 'Renforce le lien, s\'attire un adversaire.', apply(state, npc){
          adjustRelation(state, npc.id, { affinity: 10, trust: 4 });
          return `${npc.fullName} apprécie votre soutien immédiat — au prix de vous faire un ennemi dans le couloir.`;
        } },
      { label: 'Retourner dans votre chambre', sub: 'Vous évitez tout ça.', apply(state, npc){
          adjustRelation(state, npc.id, { affinity: -2 });
          return `Vous fermez votre porte, laissant les autres régler ça entre eux.`;
        } }
    ]
  },
  {
    id: 'loc_ev_music_jealousy',
    locations: ['musicroom'],
    title: 'Une jalousie discrète',
    text(state, npc){ return `${npc.fullName} vous regarde jouer avec un mélange d'admiration et d'agacement mal dissimulé.`; },
    choices: [
      { label: "L'inviter à jouer avec vous", sub: 'Transforme la rivalité en complicité.', apply(state, npc){
          adjustRelation(state, npc.id, { affinity: 9, trust: 4 });
          state.player.stats.charisme = clamp(state.player.stats.charisme + 1, 0, 100);
          return `Le duo improvisé détend l'atmosphère. ${npc.fullName} se déride un peu.`;
        } },
      { label: 'Continuer à briller seul(e)', sub: 'Bon pour votre image, mauvais pour la relation.', apply(state, npc){
          state.player.stats.popularite = clamp(state.player.stats.popularite + 2, 0, 100);
          adjustRelation(state, npc.id, { affinity: -6 });
          return `Vous continuez, indifférent(e). ${npc.fullName} s'éloigne, visiblement agacé(e).`;
        } }
    ]
  },
  {
    id: 'loc_ev_computer_catch',
    locations: ['computerroom'],
    title: 'Pris en flagrant délit',
    text(state, npc){ return `Vous surprenez ${npc.fullName} en train de manipuler discrètement des données scolaires qui ne le/la concernent pas.`; },
    choices: [
      { label: 'Le/la faire chanter', sub: 'Gain d\'influence, relation détruite.', apply(state, npc){
          state.player.stats.influence = clamp(state.player.stats.influence + 4, 0, 100);
          getRel(state, npc.id).type = 'ennemi';
          adjustRelation(state, npc.id, { affinity: -20, trust: -25, fear: 15 });
          bumpStyle(state, 'manipulateur', 4);
          return `${npc.fullName} n'a d'autre choix que de céder. Une dette qu'il/elle vous devra rembourser tôt ou tard.`;
        } },
      { label: 'Le/la couvrir en échange de rien', sub: 'Renforce durablement la confiance.', apply(state, npc){
          adjustRelation(state, npc.id, { affinity: 10, trust: 15 });
          rememberNpc(state, npc, "Vous l'avez couvert(e) sans rien demander en retour.");
          return `Vous détournez le regard sans un mot. ${npc.fullName} n'oubliera pas ce geste.`;
        } },
      { label: 'Signaler la situation', sub: 'Vous joue la carte des règles, au prix de la relation.', apply(state, npc){
          state.player.stats.reputation = clamp(state.player.stats.reputation + 2, 0, 100);
          adjustRelation(state, npc.id, { affinity: -18, trust: -15 });
          getRel(state, npc.id).type = 'ennemi';
          return `Vous signalez ce que vous avez vu. ${npc.fullName} en subit les conséquences et ne vous le pardonne pas.`;
        } }
    ]
  }
];

/** Vrai si le joueur a déjà consommé sa visite de lieu pour la semaine en cours. */
function hasUsedWeeklyLocationVisit(state){
  const v = state.player.lastLocationVisit;
  return !!(v && v.year === state.time.year && v.week === state.time.week);
}

/** Retourne le lieu déjà visité cette semaine, ou null. */
function getWeeklyVisitedLocation(state){
  if (!hasUsedWeeklyLocationVisit(state)) return null;
  return SCHOOL_LOCATIONS.find(l => l.id === state.player.lastLocationVisit.locId) || null;
}

/** Enregistre que le joueur vient de consommer sa visite de la semaine sur ce lieu. */
function markWeeklyLocationVisit(state, locId){
  state.player.lastLocationVisit = { year: state.time.year, week: state.time.week, locId };
}

/** Choisit un(e) élève plausible pour un événement de lieu donné. */
function pickNpcForLocationEvent(state, loc){
  const active = state.npcs.filter(n => n.status === 'actif');
  const sameClassPreferred = ['library', 'dorms', 'clubroom'];
  if (sameClassPreferred.includes(loc.id)){
    const sameClass = active.filter(n => n.classId === state.player.classId);
    if (sameClass.length) return pick(sameClass);
  }
  return active.length ? pick(active) : null;
}

/** Point d'entrée : le joueur se rend réellement dans un lieu de l'école. Un seul lieu peut être visité par semaine. */
function visitLocation(loc){
  const s = Game.state;

  if (hasUsedWeeklyLocationVisit(s)){
    const visited = getWeeklyVisitedLocation(s);
    openModal({
      eyebrow: "Emploi du temps chargé",
      title: 'Vous avez déjà donné votre semaine',
      bodyHtml: `<p>Vous avez déjà consacré votre temps disponible cette semaine à un passage à « ${visited ? visited.name : 'un autre lieu'} ». Revenez la semaine prochaine pour vous rendre ailleurs.</p>`,
      closeLabel: 'Compris'
    });
    return;
  }

  const eventPool = LOCATION_EVENT_POOL.filter(e => e.locations.includes(loc.id));
  const chance = LOCATION_EVENT_CHANCE[loc.id] ?? 0.42;

  markWeeklyLocationVisit(s, loc.id);

  if (eventPool.length && Math.random() < chance){
    const npc = pickNpcForLocationEvent(s, loc);
    if (npc){
      const evDef = pick(eventPool);
      SaveManager.save(s);
      renderCurrentView();
      openLocationEventModal(loc, evDef, npc);
      return;
    }
  }

  // Pas d'événement cette fois : le passage au lieu reste bénéfique, mais discret.
  const text = loc.action(s);
  SaveManager.save(s);
  renderHeader();
  if (text) openModal({ eyebrow: loc.name, title: 'Résultat', bodyHtml: `<p>${escapeHtml(text)}</p>`, closeLabel: 'Continuer' });
  renderCurrentView();
}

/** Modale d'un événement de lieu : présente la scène puis le choix, avec conséquences réelles. */
function openLocationEventModal(loc, evDef, npc){
  const s = Game.state;
  openModal({
    eyebrow: `${loc.ic} ${loc.name}`,
    title: evDef.title,
    bodyHtml: `<p>${escapeHtml(evDef.text(s, npc, loc))}</p>`,
    choices: evDef.choices.map(c => ({
      label: c.label,
      sub: c.sub,
      onClick(){
        const resultText = c.apply(s, npc, loc);
        SaveManager.save(s);
        renderHeader();
        openModal({
          eyebrow: loc.name,
          title: 'Résultat',
          bodyHtml: `<p>${escapeHtml(resultText)}</p>`,
          closeLabel: 'Continuer'
        });
        renderCurrentView();
      }
    }))
  });
}

function renderSchoolView(){
  const s = Game.state;
  const el = document.getElementById('view-school');
  const currentClub = getClub(s.player.clubId);
  el.innerHTML = `
    <h2 class="section-title">Carte de l'école</h2>

    <div class="panel">
      <div class="panel__title">Clubs <small>${currentClub ? `Membre actuel : ${currentClub.name}` : 'Vous n\'êtes membre d\'aucun club'}</small></div>
      <p class="text-dim">Rejoindre un club octroie un bonus passif lorsque vous planifiez une « Activité de club », et ouvre l'accès à des événements dédiés. Le premier engagement est gratuit ; en changer ensuite coûte 60 points.</p>
      <div class="grid-cards mt-2" id="club-list"></div>
    </div>

    <div class="panel">
      <div class="panel__title">Professeurs <small>Constituez un dossier, puis confrontez-les</small></div>
      <p class="text-dim">Enquêtez discrètement, recoupez les preuves, puis lancez une confrontation finale une fois le dossier complet (3/3). Un affrontement raté vous coûtera cher en réputation.</p>
      <div class="grid-cards mt-2" id="teacher-list"></div>
    </div>

    <div class="panel">
      <div class="panel__title">Dossier de transfert de classe <small>Monter d'un cran sans attendre le classement des examens</small></div>
      <div id="class-transfer-panel"></div>
    </div>

    <p class="text-dim mt-2">${hasUsedWeeklyLocationVisit(s) ? 'Vous avez déjà visité un lieu cette semaine. Revenez la semaine prochaine pour vous rendre ailleurs.' : 'Choisissez un lieu à visiter cette semaine — un seul déplacement est possible avant la semaine suivante.'}</p>
    <div class="school-map mt-2" id="school-map"></div>
  `;

  const clubList = document.getElementById('club-list');
  clubList.innerHTML = CLUBS.map(c => `
    <div class="item-card${c.id===s.player.clubId?' item-card--rare':''}">
      <div class="item-card__head"><span class="item-card__name">${c.ic} ${c.name}</span></div>
      <div class="item-card__desc">${c.tag}<br><span class="text-faint">Bonus : ${Object.entries(c.bonus).map(([k,v])=>`+${v} ${STAT_LABELS[k]}`).join(', ')}</span></div>
      <button class="btn btn--small ${c.id===s.player.clubId?'btn--ghost':'btn--primary'}" data-club="${c.id}" ${c.id===s.player.clubId?'disabled':''}>${c.id===s.player.clubId?'Membre':(s.player.clubId?'Rejoindre (60 pts)':'Rejoindre')}</button>
    </div>`).join('');
  clubList.querySelectorAll('button[data-club]').forEach(btn => {
    btn.addEventListener('click', () => {
      const res = joinClub(s, btn.dataset.club);
      if (!res.success){ toast('Pas assez de points pour changer de club.', 'bad'); return; }
      SaveManager.save(s);
      renderHeader();
      renderCurrentView();
      toast(`Vous rejoignez le ${getClub(btn.dataset.club).name}.`, 'good');
    });
  });

  const teacherList = document.getElementById('teacher-list');
  teacherList.innerHTML = TEACHERS.map(t => {
    const dossier = getTeacherDossier(s, t.id);
    const isDone = dossier.status !== 'actif';
    return `
    <div class="item-card${isDone ? '' : ''}">
      <div class="item-card__head"><span class="item-card__name">${t.ic} ${t.name}</span></div>
      <div class="item-card__desc">${t.subject} — ${t.trait}<br><span class="text-faint">Dossier : ${dossier.evidence}/3 · ${TEACHER_STATUS_LABELS[dossier.status]}</span></div>
      <div class="flex-row" style="display:flex; gap:.4rem; flex-wrap:wrap; margin-top:.4rem;">
        <button class="btn btn--small btn--ghost" data-teacher-action="investigate" data-teacher="${t.id}" ${isDone ? 'disabled' : ''}>Enquêter</button>
        <button class="btn btn--small btn--ghost" data-teacher-action="build" data-teacher="${t.id}" ${(isDone || dossier.evidence < 1 || dossier.evidence >= 3) ? 'disabled' : ''}>Recouper</button>
        <button class="btn btn--small btn--danger" data-teacher-action="confront" data-teacher="${t.id}" ${(isDone || dossier.evidence < 3) ? 'disabled' : ''}>Confrontation finale</button>
      </div>
    </div>`;
  }).join('');
  teacherList.querySelectorAll('button[data-teacher-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const teacherId = btn.dataset.teacher;
      const teacher = getTeacher(teacherId);
      const action = btn.dataset.teacherAction;

      if (action === 'confront'){
        openModal({
          eyebrow: 'Confrontation finale',
          title: `Affronter ${teacher.name} ?`,
          bodyHtml: `<p>Le dossier est complet. Une confrontation peut faire renvoyer ${teacher.name}, l'ébranler sans le/la faire tomber, ou se retourner violemment contre vous si elle échoue.</p>`,
          choices: [
            { label:'Passer à l\'attaque', sub:'Joue le dossier complet, résultat définitif', onClick(){
                const res = confrontTeacher(s, teacherId);
                SaveManager.save(s);
                renderHeader();
                const newlyUnlocked = checkAchievements(s);
                newlyUnlocked.forEach(ach => toast(`Objectif débloqué : ${ach.name}`, 'good', 'achievement'));
                openModal({ eyebrow: teacher.name, title:'Résultat', bodyHtml:`<p>${escapeHtml(res.text)}</p>`, closeLabel:'Continuer' });
                renderCurrentView();
              }},
            { label:'Attendre encore', sub:'Ne rien tenter pour l\'instant', onClick(){ renderCurrentView(); } }
          ]
        });
        return;
      }

      const fn = action === 'investigate' ? investigateTeacher : buildTeacherCase;
      const res = fn(s, teacherId);
      SaveManager.save(s);
      renderHeader();
      openModal({ eyebrow: teacher.name, title: res.success ? 'Progrès' : 'Résultat', bodyHtml:`<p>${escapeHtml(res.text)}</p>`, closeLabel:'Continuer' });
      renderCurrentView();
    });
  });

  const transferPanel = document.getElementById('class-transfer-panel');
  const transferStatus = getClassTransferStatus(s);
  if (transferStatus.alreadyTop){
    transferPanel.innerHTML = `<p class="text-dim">Vous êtes déjà en Classe A : il n'y a rien de plus haut à briguer par ce biais.</p>`;
  } else {
    const check = (ok) => ok ? '✅' : '❌';
    transferPanel.innerHTML = `
      <p class="text-dim">Passer directement en Classe ${transferStatus.targetClassId} sans attendre le classement des examens — au prix d'un chantage sur un(e) professeur(e). Ce transfert est individuel : votre ancienne classe et ses points ne bougent pas, seul vous changez de classe.</p>
      <div class="mt-2">
        <div class="rank-row"><div>${check(transferStatus.gradesOk)} Bons résultats récents (3 derniers examens)</div><div class="rank-row__points">${transferStatus.avgNote.toFixed(1)}/20 <span class="text-faint">(min. ${CLASS_TRANSFER_MIN_AVG_NOTE})</span></div></div>
        <div class="rank-row"><div>${check(transferStatus.relationsOk)} Relations en Classe ${transferStatus.targetClassId}</div><div class="rank-row__points">${transferStatus.relationsCount} connu(e)s <span class="text-faint">(min. ${CLASS_TRANSFER_MIN_RELATIONS}, affinité moy. ${transferStatus.avgAffinity.toFixed(0)}/${CLASS_TRANSFER_MIN_AVG_AFFINITY})</span></div></div>
        <div class="rank-row"><div>${check(transferStatus.pointsOk)} Points personnels</div><div class="rank-row__points">${s.player.points.toLocaleString('fr-FR')} <span class="text-faint">/ ${CLASS_TRANSFER_COST.toLocaleString('fr-FR')}</span></div></div>
        <div class="rank-row"><div>${check(transferStatus.teacherOk)} Dossier compromettant complet (3/3) sur un(e) professeur(e), encore inexploité</div><div class="rank-row__points">${transferStatus.availableTeacherIds.length} disponible(s)</div></div>
      </div>
      <button class="btn btn--primary mt-2" id="btn-class-transfer" ${transferStatus.allOk ? '' : 'disabled'}>Déposer le dossier de transfert</button>
    `;
    const transferBtn = document.getElementById('btn-class-transfer');
    if (transferBtn){
      transferBtn.addEventListener('click', () => {
        const freshStatus = getClassTransferStatus(s);
        if (!freshStatus.allOk) return;
        const choices = freshStatus.availableTeacherIds.map(tid => {
          const t = getTeacher(tid);
          return {
            label: `Faire pression sur ${t.name}`,
            sub: `${t.subject} — ${t.trait}`,
            onClick(){
              const res = submitClassTransferRequest(s, tid);
              SaveManager.save(s);
              renderHeader();
              const newlyUnlocked = checkAchievements(s);
              newlyUnlocked.forEach(ach => toast(`Objectif débloqué : ${ach.name}`, 'good', 'achievement'));
              openModal({
                eyebrow: 'Dossier de transfert',
                title: res.success ? 'Transfert obtenu' : 'Chantage éventé',
                bodyHtml: `<p>${escapeHtml(res.text)}</p>`,
                closeLabel: 'Continuer'
              });
              renderCurrentView();
            }
          };
        });
        openModal({
          eyebrow: 'Dossier de transfert',
          title: 'Choisir le levier de pression',
          bodyHtml: `<p>Quel dossier compromettant utiliser pour faire pression sur le conseil de classe ? Qu'elle réussisse ou non, cette manœuvre consomme le dossier et coûte ${CLASS_TRANSFER_COST.toLocaleString('fr-FR')} points.</p>`,
          choices
        });
      });
    }
  }

  const map = document.getElementById('school-map');
  const weeklyLocked = hasUsedWeeklyLocationVisit(s);
  const visitedId = weeklyLocked ? s.player.lastLocationVisit.locId : null;
  // Le kiosque (boutique) et le prêteur sur gages ne "consomment" pas la semaine :
  // ce sont des services annexes, pas un vrai déplacement narratif dans l'école.
  const freeAccessIds = ['shop', 'moneylender'];
  map.innerHTML = SCHOOL_LOCATIONS.map(loc => {
    const isFree = freeAccessIds.includes(loc.id);
    const isVisited = loc.id === visitedId;
    const isLocked = weeklyLocked && !isFree && !isVisited;
    return `
    <div class="school-loc${isVisited ? ' school-loc--visited' : ''}${isLocked ? ' school-loc--locked' : ''}" data-loc="${loc.id}">
      <div class="school-loc__ic">${loc.ic}</div>
      <div class="school-loc__name">${loc.name}</div>
      <div class="school-loc__desc">${isVisited ? 'Déjà visité cette semaine' : (isLocked ? 'Indisponible — revenez la semaine prochaine' : loc.desc)}</div>
    </div>`;
  }).join('');
  map.querySelectorAll('.school-loc').forEach(card => {
    card.addEventListener('click', () => {
      const loc = SCHOOL_LOCATIONS.find(l => l.id === card.dataset.loc);
      if (loc.id === 'shop'){ currentView = 'inventory'; document.querySelectorAll('.navbtn[data-view]').forEach(b=>b.classList.toggle('active', b.dataset.view==='inventory')); renderCurrentView(); return; }
      if (loc.id === 'moneylender'){ openMoneyLenderModal(); return; }
      if (card.classList.contains('school-loc--visited')){
        toast('Vous avez déjà passé du temps ici cette semaine.', 'info');
        return;
      }
      visitLocation(loc);
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
    <p class="text-dim" style="margin-bottom:.8rem">Les classes A, B et C bénéficient d'un avantage structurel à chaque examen (meilleurs moyens, réputation auprès de l'administration) qui s'ajoute au niveau réel de leurs élèves — plus une classe est haut placée, plus elle est difficile à dépasser. À l'inverse, une classe traversant une période de tension interne (fracture en clans, crise en cours) obtient de moins bons résultats collectifs.</p>
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
  corruption:'Corruption', exam:'Examens', relation:'Relations', shop:'Boutique', system:'Administration',
  rumeur:'Rumeurs', mystere:'Zone d\'ombre', defi:'Duels', dette:'Dettes'
};

/** Icône/label selon la tendance d'une rumeur (mauvaise, bonne, ambiguë). */
function rumorValenceMeta(valence){
  if (valence === 'bad') return { ic:'🔥', color:'#ff5c5c', label:'Nuisible' };
  if (valence === 'good') return { ic:'✨', color:'#2fbf8f', label:'Flatteuse' };
  return { ic:'❔', color:'#8fa3c9', label:'Ambiguë' };
}

function rumorsPanelHtml(state){
  const rumors = state.rumors || [];
  if (!rumors.length) return '';
  const rows = rumors.map(r => {
    const meta = rumorValenceMeta(r.valence);
    const name = r.subjectId === 'player' ? 'Vous' : r.subjectName;
    return `
      <div class="npc-memory" style="margin-bottom:.6rem">
        <div class="flex-between"><strong style="color:${meta.color}">${meta.ic} ${escapeHtml(name)}</strong><span class="tag">${meta.label}</span></div>
        <div>${escapeHtml(name)} ${escapeHtml(r.text)}.</div>
        <div class="bond-bar mt-1"><div class="bond-bar__fill" style="width:${r.strength}%; background:${meta.color}"></div></div>
      </div>`;
  }).join('');
  return `
    <div class="panel">
      <div class="panel__title">Rumeurs actives <small>${rumors.length} en circulation</small></div>
      ${rows}
    </div>`;
}
let journalFilter = 'all';

function renderJournalView(){
  const s = Game.state;
  const el = document.getElementById('view-journal');
  const types = Array.from(new Set(s.player.journal.map(e => e.type).filter(Boolean)));
  el.innerHTML = `
    <h2 class="section-title">Journal de bord</h2>
    ${rumorsPanelHtml(s)}
    <div class="toolbar">
      ${types.length ? `<span class="toolbar__label">Filtrer</span>
      <select class="toolbar__select" id="journal-filter">
        <option value="all" ${journalFilter==='all'?'selected':''}>Tout afficher</option>
        ${types.map(t => `<option value="${t}" ${journalFilter===t?'selected':''}>${JOURNAL_TYPE_LABELS[t] || t}</option>`).join('')}
      </select>` : ''}
      <button type="button" class="btn btn--ghost" id="btn-export-journal" style="margin-left:auto">Exporter ma sauvegarde</button>
    </div>
    <div class="panel" id="journal-full"></div>
  `;
  const filterSel = document.getElementById('journal-filter');
  if (filterSel) filterSel.addEventListener('change', () => { journalFilter = filterSel.value; renderJournalView(); });
  const exportBtn = document.getElementById('btn-export-journal');
  if (exportBtn) exportBtn.addEventListener('click', () => { SaveManager.save(Game.state); SaveManager.exportToFile(); });

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
  const btnExport = document.getElementById('btn-export');
  if (btnExport) btnExport.addEventListener('click', () => SaveManager.exportToFile());
  const btnImport = document.getElementById('btn-import');
  const fileImport = document.getElementById('file-import');
  if (btnImport && fileImport){
    btnImport.addEventListener('click', () => fileImport.click());
    fileImport.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      SaveManager.importFromFile(file, (ok) => { if (ok) refreshMenuButtons(); fileImport.value = ''; });
    });
  }
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
  Music.init();
  const musicBtn = document.getElementById('hdr-music');
  if (musicBtn){
    musicBtn.addEventListener('click', () => {
      Music.toggle();
      SFX.play('click');
    });
  }
  const musicCaret = document.getElementById('hdr-music-caret');
  const musicMenu = document.getElementById('hdr-music-menu');
  if (musicCaret && musicMenu){
    musicCaret.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = musicMenu.classList.toggle('open');
      musicCaret.classList.toggle('hdr-music-caret--open', open);
      if (open) SFX.play('nav');
    });
    document.addEventListener('click', (e) => {
      if (!musicMenu.classList.contains('open')) return;
      if (e.target === musicCaret || musicMenu.contains(e.target)) return;
      musicMenu.classList.remove('open');
      musicCaret.classList.remove('hdr-music-caret--open');
    });
  }
  wireNav();
  wireMenu();
  wireCreate();
  bootSequence();

  // autosave périodique de sécurité (en plus des sauvegardes déclenchées par action)
  setInterval(() => { if (Game.state) SaveManager.save(Game.state); }, 20000);

  // Échap ferme la modale ouverte (confort clavier)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('modal-root').querySelector('.modal-overlay')){
      closeModal();
    }
  });

  // Sauvegarde de sécurité si l'onglet se ferme / se recharge en pleine partie
  window.addEventListener('beforeunload', () => { if (Game.state) SaveManager.save(Game.state); });
});
