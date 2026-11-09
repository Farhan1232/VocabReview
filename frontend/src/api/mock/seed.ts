/**
 * Demo data for mock mode (`npm run dev:mock`). backend/app/services/sample.py holds the same word list
 * for the real app, because the two run separately and share no code.
 * Columns: english | polish (comma list) | definition | pos | cefr | topics (; list) | example
 */
import type { Cefr, ReviewLog, Student, StudentCard, VocabItem, VocabSet, Rating } from '../types';
import { newFsrsCard, rate } from '@/lib/fsrs';
import { DEFAULT_RETENTION } from '@/lib/retention';
import { seededRandom } from '@/lib/random';

type Row = [string, string, string, string, Cefr | '', string, string];

const ROWS: Row[] = [
  [
    'bank',
    'bank',
    'an organization that keeps and lends money',
    'noun',
    'A2',
    'Money',
    'I need to go to the bank to open an account.',
  ],
  ['bank', 'brzeg', 'the land along the side of a river', 'noun', 'B1', 'Nature', 'We had a picnic on the river bank.'],
  [
    'book',
    'rezerwować',
    'to arrange to have a seat, room, or ticket',
    'verb',
    'A2',
    'Travel',
    'We booked a table for eight o’clock.',
  ],
  [
    'book',
    'książka',
    'a set of printed pages fastened together',
    'noun',
    'A1',
    'Daily life',
    'She is reading a book about Poland.',
  ],
  [
    'boil',
    'gotować (się), wrzeć',
    'to heat liquid until it bubbles',
    'verb',
    'A2',
    'Cooking',
    'Boil the water before adding the pasta.',
  ],
  ['chop', 'siekać, kroić', 'to cut into small pieces', 'verb', 'B1', 'Cooking', 'Chop the onions finely.'],
  [
    'simmer',
    'gotować na wolnym ogniu',
    'to cook gently just below boiling',
    'verb',
    'B2',
    'Cooking',
    'Let the soup simmer for twenty minutes.',
  ],
  ['recipe', 'przepis', 'instructions for cooking a dish', 'noun', 'A2', 'Cooking', 'This is my grandmother’s recipe.'],
  [
    'ingredient',
    'składnik',
    'one of the foods used to make a dish',
    'noun',
    'B1',
    'Cooking',
    'Check that you have all the ingredients.',
  ],
  ['frying pan', 'patelnia', 'a flat pan for frying food', 'noun', 'A2', 'Cooking', 'Heat some oil in a frying pan.'],
  [
    'oven',
    'piekarnik',
    'a closed box used for baking and roasting',
    'noun',
    'A2',
    'Cooking',
    'Preheat the oven to 180 degrees.',
  ],
  ['tasty', 'smaczny', 'having a pleasant flavor', 'adjective', 'A2', 'Cooking', 'That was a really tasty meal.'],
  [
    'leftovers',
    'resztki',
    'food left uneaten after a meal',
    'noun',
    'B1',
    'Cooking',
    'We had the leftovers for lunch.',
  ],
  [
    'peel',
    'obierać',
    'to remove the skin from fruit or vegetables',
    'verb',
    'B1',
    'Cooking',
    'Peel the potatoes and cut them in half.',
  ],
  [
    'luggage',
    'bagaż',
    'bags and suitcases taken on a trip',
    'noun',
    'A2',
    'Travel',
    'How much luggage are you taking?',
  ],
  [
    'boarding pass',
    'karta pokładowa',
    'a document that lets you get on a plane',
    'noun',
    'B1',
    'Travel',
    'Please show your boarding pass at the gate.',
  ],
  [
    'delay',
    'opóźnienie',
    'a period of waiting longer than planned',
    'noun',
    'B1',
    'Travel',
    'There is a two-hour delay on our flight.',
  ],
  [
    'round trip',
    'podróż w obie strony',
    'a journey to a place and back again',
    'noun',
    'B1',
    'Travel',
    'A round trip ticket is cheaper.',
  ],
  [
    'sightseeing',
    'zwiedzanie',
    'visiting interesting places as a tourist',
    'noun',
    'A2',
    'Travel',
    'We spent the day sightseeing in Kraków.',
  ],
  [
    'check in',
    'zameldować się',
    'to arrive and register at a hotel or airport',
    'phrasal verb',
    'A2',
    'Travel',
    'We checked in at the hotel at noon.',
  ],
  ['set off', 'wyruszyć', 'to start a journey', 'phrasal verb', 'B1', 'Travel', 'We set off early to avoid traffic.'],
  [
    'itinerary',
    'plan podróży',
    'a detailed plan for a journey',
    'noun',
    'C1',
    'Travel',
    'Our itinerary includes three cities.',
  ],
  [
    'customs',
    'odprawa celna',
    'the place where bags are checked at a border',
    'noun',
    'B1',
    'Travel',
    'We waited an hour at customs.',
  ],
  [
    'deadline',
    'termin',
    'the latest time by which something must be done',
    'noun',
    'B1',
    'Business',
    'The deadline for the report is Friday.',
  ],
  [
    'negotiate',
    'negocjować',
    'to discuss in order to reach an agreement',
    'verb',
    'B2',
    'Business',
    'We negotiated a better price.',
  ],
  [
    'revenue',
    'przychód',
    'money a company receives from its business',
    'noun',
    'C1',
    'Business',
    'Revenue grew by ten percent last year.',
  ],
  [
    'colleague',
    'kolega z pracy, współpracownik',
    'a person you work with',
    'noun',
    'B1',
    'Business',
    'I’m having lunch with a colleague.',
  ],
  [
    'run a business',
    'prowadzić firmę',
    'to manage a company',
    'phrase',
    'B2',
    'Business',
    'She has run a business for ten years.',
  ],
  ['hire', 'zatrudnić', 'to give someone a job', 'verb', 'B1', 'Business', 'The company hired five new engineers.'],
  [
    'fire',
    'zwolnić',
    'to dismiss someone from a job',
    'verb',
    'B1',
    'Business',
    'He was fired for being late every day.',
  ],
  [
    'fire',
    'ogień, pożar',
    'flames and heat from something burning',
    'noun',
    'A2',
    'Nature',
    'The fire spread quickly through the forest.',
  ],
  [
    'invoice',
    'faktura',
    'a list of goods or services and the amount due',
    'noun',
    'B2',
    'Business; Money',
    'Please send the invoice by email.',
  ],
  [
    'budget',
    'budżet',
    'a plan of how money will be spent',
    'noun',
    'B1',
    'Money; Business',
    'We are over budget this month.',
  ],
  [
    'afford',
    'pozwolić sobie (finansowo)',
    'to have enough money for something',
    'verb',
    'B1',
    'Money',
    'We can’t afford a new car.',
  ],
  ['savings', 'oszczędności', 'money kept for the future', 'noun', 'B1', 'Money', 'I used my savings to buy a laptop.'],
  ['change', 'reszta (pieniądze)', 'money given back when you pay too much', 'noun', 'A2', 'Money', 'Keep the change.'],
  [
    'change',
    'zmieniać',
    'to make or become different',
    'verb',
    'A1',
    'Daily life',
    'The weather changes quickly here.',
  ],
  [
    'grateful',
    'wdzięczny',
    'feeling thanks for something',
    'adjective',
    'B1',
    'Emotions',
    'I’m grateful for your help.',
  ],
  [
    'embarrassed',
    'zawstydzony',
    'feeling uncomfortable or ashamed',
    'adjective',
    'B1',
    'Emotions',
    'He was embarrassed when he forgot her name.',
  ],
  [
    'anxious',
    'zaniepokojony',
    'worried and nervous',
    'adjective',
    'B2',
    'Emotions',
    'She felt anxious before the exam.',
  ],
  [
    'proud',
    'dumny',
    'pleased about something you or others did',
    'adjective',
    'A2',
    'Emotions',
    'I’m very proud of you.',
  ],
  [
    'look forward to',
    'nie móc się doczekać',
    'to feel happy about something that will happen',
    'phrasal verb',
    'B1',
    'Emotions',
    'I’m looking forward to the holidays.',
  ],
  [
    'get on with',
    'dogadywać się z',
    'to have a friendly relationship with',
    'phrasal verb',
    'B1',
    'Emotions; Daily life',
    'I get on well with my neighbors.',
  ],
  [
    'commute',
    'dojeżdżać do pracy',
    'to travel regularly between home and work',
    'verb',
    'B1',
    'Daily life',
    'I commute by train every day.',
  ],
  [
    'chores',
    'obowiązki domowe',
    'regular jobs done at home',
    'noun',
    'B1',
    'Daily life',
    'We share the chores at home.',
  ],
  [
    'oversleep',
    'zaspać',
    'to sleep longer than you intended',
    'verb',
    'B1',
    'Daily life',
    'I overslept and missed the bus.',
  ],
  ['neighbor', 'sąsiad', 'a person who lives near you', 'noun', 'A2', 'Daily life', 'Our neighbor has a big dog.'],
  [
    'take out the trash',
    'wynieść śmieci',
    'to remove rubbish from the house',
    'phrase',
    'A2',
    'Daily life',
    'Can you take out the trash, please?',
  ],
  [
    'appointment',
    'wizyta, umówione spotkanie',
    'an arranged meeting at a set time',
    'noun',
    'B1',
    'Health; Daily life',
    'I have a dentist appointment at three.',
  ],
  ['sore throat', 'ból gardła', 'pain in the throat', 'noun', 'A2', 'Health', 'I have a sore throat and a cold.'],
  [
    'prescription',
    'recepta',
    'a doctor’s written order for medicine',
    'noun',
    'B2',
    'Health',
    'You need a prescription for this medicine.',
  ],
  [
    'recover',
    'wyzdrowieć',
    'to become healthy again',
    'verb',
    'B1',
    'Health',
    'He recovered quickly after the operation.',
  ],
  [
    'sprain',
    'skręcić (np. kostkę)',
    'to injure a joint by twisting it',
    'verb',
    'B2',
    'Health',
    'I sprained my ankle playing football.',
  ],
  ['drought', 'susza', 'a long period without rain', 'noun', 'B2', 'Nature', 'The drought destroyed the crops.'],
  [
    'shore',
    'brzeg (morza, jeziora)',
    'the land along the edge of the sea or a lake',
    'noun',
    'B1',
    'Nature',
    'We walked along the shore.',
  ],
  [
    'valley',
    'dolina',
    'low land between hills or mountains',
    'noun',
    'B1',
    'Nature',
    'The village lies in a green valley.',
  ],
  [
    'endangered',
    'zagrożony wyginięciem',
    'at risk of disappearing completely',
    'adjective',
    'B2',
    'Nature',
    'The lynx is an endangered species.',
  ],
  [
    'light',
    'światło',
    'the brightness from the sun or a lamp',
    'noun',
    'A1',
    'Daily life',
    'Turn on the light, please.',
  ],
  ['light', 'lekki', 'not heavy', 'adjective', 'A2', 'Daily life', 'This bag is very light.'],
  [
    'nevertheless',
    'niemniej jednak',
    'despite what has just been said',
    'adverb',
    'C1',
    'Linking words',
    'It was raining; nevertheless, we went out.',
  ],
  [
    'although',
    'chociaż',
    'despite the fact that',
    'conjunction',
    'B1',
    'Linking words',
    'Although he was tired, he finished the work.',
  ],
  [
    'whereas',
    'podczas gdy',
    'used to compare two different facts',
    'conjunction',
    'B2',
    'Linking words',
    'I like tea, whereas my wife prefers coffee.',
  ],
  [
    'ubiquitous',
    'wszechobecny',
    'seeming to be everywhere',
    'adjective',
    'C2',
    'Academic',
    'Smartphones are now ubiquitous.',
  ],
  [
    'mitigate',
    'łagodzić',
    'to make something less harmful or serious',
    'verb',
    'C1',
    'Academic',
    'Trees help mitigate the effects of heat.',
  ],
  [
    'hypothesis',
    'hipoteza',
    'an idea that can be tested',
    'noun',
    'C1',
    'Academic',
    'The experiment supported our hypothesis.',
  ],
  [
    'break the ice',
    'przełamać lody',
    'to make people feel more relaxed',
    'idiom',
    'B2',
    'Idioms',
    'He told a joke to break the ice.',
  ],
  ['piece of cake', 'bułka z masłem', 'something very easy', 'idiom', 'B1', 'Idioms', 'The test was a piece of cake.'],
  [
    'under the weather',
    'niedysponowany',
    'feeling slightly ill',
    'idiom',
    'B2',
    'Idioms; Health',
    'I’m a bit under the weather today.',
  ],
  // Deliberately incomplete records, to show the "missing" filters.
  ['wardrobe', '', 'a tall cupboard for hanging clothes', 'noun', 'A2', 'Home', ''],
  ['dishwasher', 'zmywarka', '', 'noun', '', 'Home', ''],
  ['landlord', '', '', 'noun', 'B1', '', 'Our landlord raised the rent.'],
];

/** Shape of the demo database. */
export interface SeedDb {
  items: VocabItem[];
  sets: VocabSet[];
  students: Student[];
  cards: StudentCard[];
  logs: ReviewLog[];
}

/** Builds the demo data, including simulated review history. */
export function buildSeed(now = new Date()): SeedDb {
  const iso = (d: Date) => d.toISOString();
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);
  const created = iso(daysAgo(60));

  const items: VocabItem[] = ROWS.map(([english, pl, def, pos, cefr, topics, example], i) => ({
    id: `v${String(i + 1).padStart(4, '0')}`,
    english,
    polish: pl ? pl.split(',').map((s) => s.trim()) : [],
    definition: def || null,
    partOfSpeech: pos || null,
    cefr: cefr || null,
    example: example || null,
    topics: topics ? topics.split(';').map((s) => s.trim()) : [],
    notes: i === 0 ? 'Contrast with "bank" (river) — item v0002.' : null,
    archived: false,
    createdAt: created,
    updatedAt: created,
  }));

  const byTopic = (reviewTime: string) => items.filter((i) => i.topics.includes(reviewTime)).map((i) => i.id);

  const sets: VocabSet[] = [
    {
      id: 'set_travel',
      name: 'Travel Vocabulary',
      description: 'Airport, hotel and sightseeing',
      itemIds: byTopic('Travel'),
    },
    {
      id: 'set_cooking',
      name: 'A2 Cooking',
      description: 'Kitchen verbs and nouns',
      itemIds: items
        .filter((i) => i.topics.includes('Cooking') && (i.cefr === 'A2' || i.cefr === 'B1'))
        .map((i) => i.id),
    },
    { id: 'set_business', name: 'Business English', description: null, itemIds: byTopic('Business') },
    { id: 'set_idioms', name: 'Everyday Idioms', description: 'Fun ones for warm-ups', itemIds: byTopic('Idioms') },
  ].map((s) => ({ ...s, createdAt: created, updatedAt: created }));

  const students: Student[] = [
    { id: 'st_john', name: 'John Nowak', notes: 'B1 · exam in June', active: true, createdAt: created },
    { id: 'st_anna', name: 'Anna Kowalska', notes: 'Business focus', active: true, createdAt: created },
    { id: 'st_piotr', name: 'Piotr Wiśniewski', notes: 'Teen, travels a lot', active: true, createdAt: created },
    { id: 'st_zofia', name: 'Zofia Lewandowska', notes: null, active: false, createdAt: created },
  ];

  const cards: StudentCard[] = [];
  const logs: ReviewLog[] = [];
  const rnd = seededRandom(42);
  const pickRating = (): Rating => {
    const roll = rnd();
    return roll < 0.15 ? 1 : roll < 0.3 ? 2 : roll < 0.85 ? 3 : 4;
  };

  const plan: [string, string[], number][] = [
    ['st_john', [...byTopic('Cooking'), ...byTopic('Travel'), ...byTopic('Emotions'), 'v0001', 'v0002'], 0.85],
    ['st_anna', [...byTopic('Business'), ...byTopic('Money'), ...byTopic('Linking words')], 0.9],
    ['st_piotr', [...byTopic('Travel'), ...byTopic('Idioms'), ...byTopic('Daily life')], 0.6],
  ];

  for (const [studentId, ids, reviewedShare] of plan) {
    for (const itemId of new Set(ids)) {
      const assignedAt = daysAgo(30 + Math.floor(rnd() * 20));
      let fsrs = newFsrsCard(assignedAt);
      const cardId = `c_${studentId}_${itemId}`;
      if (rnd() < reviewedShare) {
        let reviewTime = new Date(assignedAt.getTime() + rnd() * 3 * 86_400_000);
        // Keep reviewing on schedule up to today; ~20 % of cards stop early so some are overdue.
        const stopsEarly = rnd() < 0.2;
        const reviews = stopsEarly ? 1 + Math.floor(rnd() * 3) : 60;
        for (let k = 0; k < reviews && reviewTime < now; k++) {
          const rating = pickRating();
          const prev = fsrs;
          fsrs = rate(fsrs, rating, DEFAULT_RETENTION, reviewTime);
          logs.push({
            id: `l_${cardId}_${k}`,
            cardId,
            studentId,
            itemId,
            kind: 'review',
            rating,
            reviewedAt: reviewTime.toISOString(),
            previousDue: prev.reps ? prev.due : null,
            nextDue: fsrs.due,
            previousState: prev.state,
            nextState: fsrs.state,
            requestId: `seed_${cardId}_${k}`,
            note: null,
          });
          // Next review happens around the scheduled date, sometimes late (overdue), sometimes not yet.
          const due = new Date(fsrs.due).getTime();
          const next = due + (rnd() - 0.5) * 0.3 * Math.max(86_400_000, due - reviewTime.getTime());
          reviewTime = new Date(Math.max(next, reviewTime.getTime() + 10 * 60_000));
        }
      }
      cards.push({ id: cardId, studentId, itemId, archived: false, assignedAt: assignedAt.toISOString(), fsrs });
    }
  }

  return { items, sets, students, cards, logs };
}
