// Authentic Proto-Slavic / Old Slavic names (pre-Christian era)

export const MALE_NAMES = [
  'Vladmir', 'Jaroslav', 'Borislav', 'Mstislav', 'Sviatoslav',
  'Dobromir', 'Radomir', 'Vsevolod', 'Yaromir', 'Dalibor',
  'Dobroslav', 'Miroslav', 'Radoslav', 'Miloslav', 'Bronislav',
  'Vlastimir', 'Vratislav', 'Dragomir', 'Stanimir', 'Kazimir',
  'Lubomir', 'Velimir', 'Zvonimir', 'Ratimir', 'Tihomir',
  'Slavomir', 'Borivoj', 'Bogdan', 'Bogumil', 'Bozhidar',
  'Dragutin', 'Radovan', 'Rostislav', 'Premysl', 'Sobeslav',
  'Chestibor', 'Dobrogost', 'Gostislav', 'Ninoslav', 'Krasimir',
  'Mojmir', 'Velibor', 'Vitomir', 'Milivoj', 'Vuk',
  'Mladen', 'Plamen', 'Zdravko', 'Ognjen', 'Boran',
] as const;

export const FEMALE_NAMES = [
  'Miroslava', 'Yaroslava', 'Ludmila', 'Milena', 'Branislava',
  'Miloslava', 'Radoslava', 'Dobroslava', 'Vladislava', 'Stanislava',
  'Vlastimila', 'Bronislava', 'Svetoslava', 'Dragomira', 'Bojana',
  'Bozena', 'Bogumila', 'Desislava', 'Dragoslava', 'Velislava',
  'Zorislava', 'Rogneda', 'Predslava', 'Dobromila', 'Vesna',
  'Zora', 'Zlata', 'Mila', 'Rada', 'Slava',
  'Mira', 'Ziva', 'Brana', 'Luba', 'Sveta',
  'Jasna', 'Jagoda', 'Kalina', 'Snezana', 'Milana',
  'Danica', 'Libusza', 'Mirna', 'Milada', 'Zdravka',
  'Cveta', 'Duszana', 'Iskra', 'Temira', 'Stoja',
] as const;

export function randomName(gender: 'male' | 'female'): string {
  const pool = gender === 'male' ? MALE_NAMES : FEMALE_NAMES;
  return pool[Math.floor(Math.random() * pool.length)];
}
