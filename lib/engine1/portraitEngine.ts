export interface PortraitInput {
  selfie: string; // data URL or remote URL of the captured/uploaded photo
  team: string;
  player?: string;
}

export interface PortraitOutput {
  colorImage: string;   // finished color portrait (URL or data URI)
  width: number;
  height: number;
}

export interface PortraitEngine {
  generate(input: PortraitInput): Promise<PortraitOutput>;
}

export function buildPrompt(input: PortraitInput): string {
  const withPlayer = input.player ? `, standing next to football star ${input.player}` : '';
  return (
    `Hand-drawn portrait of this person as a passionate ${input.team} football fan` +
    `${withPlayer}, wearing the ${input.team} kit, face paint and flag colors, ` +
    `warm pencil-and-ink illustration, World Cup energy, clean line art.`
  );
}
