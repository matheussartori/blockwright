// Which knowledge guides to include for a given prompt. Kept free of Electron/fs
// imports so it's unit-testable in isolation (knowledge.ts, which reads the files,
// imports `app` from electron).

// Guides that are large AND only relevant to a specific kind of build — included
// only when the prompt matches, instead of riding along in every system prompt.
const SITUATIONAL: { file: string; keywords: RegExp }[] = [
  { file: '14-towers.md', keywords: /\b(tower|spire|turret|belfry|minaret|steeple|torre|campan|farol)\w*/i },
];

/** Which guides to include for `prompt`: every core guide always, plus a situational
 *  guide only when the prompt mentions its subject. Pure (filenames + prompt in →
 *  filenames out). */
export function relevantGuides(files: string[], prompt: string): string[] {
  return files.filter((f) => {
    const sit = SITUATIONAL.find((s) => f.endsWith(s.file));
    return !sit || sit.keywords.test(prompt);
  });
}
