export function shareText(config: { team: string; player?: string }): string {
  const withPlayer = config.player ? ` with ${config.player}` : '';
  return `I got drawn by DrawMyAI in ${config.team} colors${withPlayer}! 🎨⚽`;
}
