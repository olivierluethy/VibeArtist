import { NextResponse } from 'next/server';
import type { DrawingPlan } from '@/lib/drawing/types';
import { WORLD_CUP_FIXTURE } from '@/lib/drawing/fixtures';
import { generateDrawingPlan } from '@/lib/engine1/generationService';
import type { PortraitInput } from '@/lib/engine1/portraitEngine';
import { RealPortraitEngine } from '@/lib/engine1/realPortraitEngine';

export const runtime = 'nodejs';

export async function resolvePlan(
  input: PortraitInput,
  opts: { mock: boolean },
): Promise<DrawingPlan> {
  if (opts.mock) return WORLD_CUP_FIXTURE;
  return generateDrawingPlan(input, new RealPortraitEngine());
}

export async function POST(req: Request) {
  try {
    const input = (await req.json()) as PortraitInput;
    const mock = !process.env.PORTRAIT_API_URL;
    const plan = await resolvePlan(input, { mock });
    return NextResponse.json(plan);
  } catch (err) {
    console.error('[api/generate] failed', err);
    return NextResponse.json({ error: 'generation failed' }, { status: 500 });
  }
}
