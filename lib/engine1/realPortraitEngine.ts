import type { PortraitEngine, PortraitOutput } from './portraitEngine';
export class RealPortraitEngine implements PortraitEngine {
  async generate(): Promise<PortraitOutput> {
    throw new Error('RealPortraitEngine not configured');
  }
}
