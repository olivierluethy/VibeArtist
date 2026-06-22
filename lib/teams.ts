export interface Team {
  id: string;
  name: string;
  emoji: string;
  players: string[];
}

export const TEAMS: Team[] = [
  { id: 'brazil', name: 'Brazil', emoji: '🇧🇷', players: ['Neymar', 'Vinícius', 'Rodrygo'] },
  { id: 'argentina', name: 'Argentina', emoji: '🇦🇷', players: ['Messi', 'Álvarez', 'Martínez'] },
  { id: 'france', name: 'France', emoji: '🇫🇷', players: ['Mbappé', 'Griezmann', 'Dembélé'] },
  { id: 'usa', name: 'USA', emoji: '🇺🇸', players: ['Pulisic', 'Weah', 'Reyna'] },
  { id: 'england', name: 'England', emoji: '🏴', players: ['Bellingham', 'Kane', 'Saka'] },
  { id: 'portugal', name: 'Portugal', emoji: '🇵🇹', players: ['Ronaldo', 'Fernandes', 'Leão'] },
];

export function findTeam(id: string): Team | undefined {
  return TEAMS.find((t) => t.id === id);
}
