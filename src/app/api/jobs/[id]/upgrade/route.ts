import { NextResponse } from 'next/server';
import { ApiError, errorResponse, optionalSession, throttle } from '@/lib/api';
import { createJob, getJob } from '@/lib/jobs';
import type { TaskId } from '@/lib/models';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Draft, then final. The cheap pass is what you iterate on; this promotes the
 * one you liked to the premium model, reusing its exact prompt and settings.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await optionalSession();
    if (!user) throw new ApiError('No wallet on this device.', 'no_session', 401);

    const { id } = await context.params;
    const draft = await getJob(id, user.id);
    if (!draft) throw new ApiError('No such generation.', 'not_found', 404);
    if (draft.tier !== 'draft') throw new ApiError('That is already a final.', 'not_a_draft');
    if (draft.status !== 'completed') {
      throw new ApiError('Only a finished draft can be upgraded.', 'draft_not_ready');
    }

    const body = (await request.json().catch(() => ({}))) as {
      modelOverride?: string;
      quotedCredits?: number;
    };
    await throttle(`gen:${user.id}`, 20, 60);

    const params = draft.params as {
      aspectRatio?: string;
      durationSeconds?: number;
      withAudio?: boolean;
    };

    const result = await createJob({
      userId: user.id,
      task: draft.task as TaskId,
      tier: 'final',
      prompt: draft.prompt,
      aspectRatio: params.aspectRatio,
      durationSeconds: params.durationSeconds,
      withAudio: params.withAudio,
      imageUrl: draft.input_url ?? undefined,
      modelOverride: body.modelOverride,
      // Consent carries forward from the draft that already collected it.
      consent: draft.consent_at !== null,
      parentJobId: draft.id,
      quotedCredits: body.quotedCredits,
    });

    return NextResponse.json({ job: result.job, wallet: result.wallet });
  } catch (error) {
    return errorResponse(error);
  }
}
