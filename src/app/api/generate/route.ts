import { NextResponse } from 'next/server';
import { applySession, ensureSession, errorResponse, readJson, throttle } from '@/lib/api';
import { createJob, type Job } from '@/lib/jobs';
import type { TaskId, Tier } from '@/lib/models';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface GenerateBody {
  task: TaskId;
  tier: Tier;
  prompt: string;
  aspectRatio?: string;
  durationSeconds?: number;
  withAudio?: boolean;
  imageUrl?: string;
  modelOverride?: string;
  consent?: boolean;
  parentJobId?: string;
  quotedCredits?: number;
}

export async function POST(request: Request) {
  try {
    // Bootstrapping here is what lets a first-time visitor generate without
    // ever meeting a signup form.
    const session = await ensureSession(request.headers);
    const body = await readJson<GenerateBody>(request);

    await throttle(`gen:${session.user.id}`, 20, 60);

    const result = await createJob({
      userId: session.user.id,
      task: body.task,
      tier: body.tier,
      prompt: body.prompt ?? '',
      aspectRatio: body.aspectRatio,
      durationSeconds: body.durationSeconds,
      withAudio: body.withAudio,
      imageUrl: body.imageUrl,
      modelOverride: body.modelOverride,
      consent: body.consent,
      parentJobId: body.parentJobId,
      quotedCredits: body.quotedCredits,
    });

    return applySession(
      NextResponse.json({
        job: result.job satisfies Job,
        wallet: result.wallet,
        recoveryCode: session.freshRecoveryCode ?? null,
      }),
      session,
    );
  } catch (error) {
    return errorResponse(error);
  }
}
