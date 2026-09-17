import type { Metadata } from 'next';
import Studio from '@/components/studio';
import { optionalSession } from '@/lib/api';
import { TASKS, type TaskId } from '@/lib/models';
import { callPublic } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Studio',
  description: 'Pick what you are making, describe it, see the price, generate.',
};

/**
 * Pulls the scene out of a shared video so it can be re-cast.
 *
 * A remix always lands on the cast task — the point is to put *you* in the
 * scene you just watched — so a prompt written for a generic subject is
 * re-pointed at the reference images before it is handed over.
 */
async function loadRemix(slug: string): Promise<string | undefined> {
  try {
    const share = await callPublic<{ prompt?: string } | null>('jv_share_get', { p_slug: slug });
    if (!share?.prompt) return undefined;
    return share.prompt.replace(
      /\b(a person|the subject|the product|a lone figure)\b/gi,
      TASKS.star_in_it.subjectPhrase,
    );
  } catch {
    return undefined;
  }
}

export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<{ task?: string; remix?: string; scene?: string }>;
}) {
  // Read-only: an anonymous visit does not mint a wallet until they generate.
  const user = await optionalSession();
  const { task, remix, scene } = await searchParams;

  const remixPrompt = remix ? await loadRemix(remix) : undefined;
  const initialTask = remixPrompt
    ? 'star_in_it'
    : task && task in TASKS
      ? (task as TaskId)
      : undefined;

  return (
    <Studio
      initialWallet={user?.wallet ?? null}
      initialTask={initialTask}
      initialPrompt={remixPrompt}
      initialScene={scene}
    />
  );
}
