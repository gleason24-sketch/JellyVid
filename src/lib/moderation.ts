/**
 * Moderation copy and the "Rewrite safely" rewriter.
 *
 * Complaint #5 is a block with no reason and no way forward, charged anyway.
 * Two fixes here: a plain-English reason, and a one-click rewrite that keeps
 * the user's idea and drops the words that trip filters.
 *
 * The rewriter is deterministic and runs locally, so it works with no extra API
 * key and costs nothing. When JELLYVID_LLM_API_KEY is set, rewriteWithLlm takes
 * over for better phrasing; the local pass stays as the fallback.
 */

export interface RewriteResult {
  prompt: string;
  changed: boolean;
  notes: string[];
}

/** Each entry is a term filters commonly reject, plus a neutral stand-in. */
const SUBSTITUTIONS: Array<{ pattern: RegExp; replacement: string; note: string }> = [
  { pattern: /\bnude|naked|topless|undressed\b/gi, replacement: 'fully clothed', note: 'Removed nudity wording.' },
  { pattern: /\bnsfw|explicit|erotic|sexual|seductive|lingerie\b/gi, replacement: 'stylish', note: 'Removed adult wording.' },
  { pattern: /\bblood|bloody|gore|gory|mutilat\w*\b/gi, replacement: 'dramatic', note: 'Removed graphic violence wording.' },
  { pattern: /\bkill|murder|shoot(?:ing)?|stab\w*|behead\w*\b/gi, replacement: 'confront', note: 'Removed violent action wording.' },
  { pattern: /\bgun|rifle|pistol|firearm|weapon\b/gi, replacement: 'prop', note: 'Removed weapon wording.' },
  { pattern: /\bdrug|cocaine|heroin|meth\b/gi, replacement: 'prop bottle', note: 'Removed drug wording.' },
  { pattern: /\bchild|kid|minor|teen|underage\b/gi, replacement: 'adult', note: 'Changed the subject to an adult.' },
  { pattern: /\bcorpse|dead body|suicide\b/gi, replacement: 'still figure', note: 'Removed death wording.' },
  { pattern: /\bgrotesque|disturbing|horrifying\b/gi, replacement: 'moody', note: 'Softened intensity wording.' },
];

/** Names we will not render a likeness of, however the prompt frames it. */
const PUBLIC_FIGURE_HINTS =
  /\b(president|prime minister|senator|pope|celebrity|taylor swift|elon musk|donald trump|joe biden|kim kardashian|cristiano ronaldo|lionel messi|beyonce|obama|putin|zelensky)\b/i;

export function rewriteSafely(prompt: string): RewriteResult {
  let output = prompt;
  const notes: string[] = [];

  for (const { pattern, replacement, note } of SUBSTITUTIONS) {
    if (pattern.test(output)) {
      output = output.replace(pattern, replacement);
      if (!notes.includes(note)) notes.push(note);
    }
  }

  if (PUBLIC_FIGURE_HINTS.test(output)) {
    output = output.replace(PUBLIC_FIGURE_HINTS, 'an original fictional character');
    notes.push('Swapped a real public figure for an original character.');
  }

  output = output.replace(/\s+/g, ' ').trim();

  // A suffix that steers the model toward the safe read of an ambiguous prompt.
  const SAFE_SUFFIX = 'Tasteful, brand-safe, suitable for all audiences.';
  if (!output.toLowerCase().includes('brand-safe')) {
    output = `${output}${output.endsWith('.') ? '' : '.'} ${SAFE_SUFFIX}`;
    notes.push('Added a brand-safe framing note.');
  }

  return { prompt: output, changed: output !== prompt, notes };
}

/** Screens uploads and prompts before we spend anything at the provider. */
export function looksLikePublicFigure(text: string): boolean {
  return PUBLIC_FIGURE_HINTS.test(text);
}

const BLOCK_REASONS: Record<string, string> = {
  nsfw:
    'The model’s content filter read this as unsafe. That is the model’s call, not ours — and it cost you nothing.',
  prompt_public_figure:
    'This looks like a real public figure. We do not generate likenesses of real people without consent.',
  prompt_blocked:
    'This prompt was blocked before it ran, so no credits left your wallet.',
};

export function moderationReason(code: string): string {
  return BLOCK_REASONS[code] ?? BLOCK_REASONS.prompt_blocked;
}
