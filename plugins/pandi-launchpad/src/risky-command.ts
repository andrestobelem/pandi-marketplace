// Destructive/hard-to-reverse shell commands worth gating behind a physical
// confirm, mirroring the "risky actions" examples from Claude Code's own
// system prompt ("Executing actions with care" section: force-push, reset
// --hard, rm -rf, etc).

function flagTokens(command: string): string[] {
  return command.split(/\s+/).filter((t) => t.startsWith("-"));
}

function hasShortOrLongFlag(command: string, letter: string, long: string): boolean {
  return flagTokens(command).some(
    (t) => t === long || (t.startsWith("-") && !t.startsWith("--") && t.includes(letter)),
  );
}

function pushIsForce(command: string): boolean {
  if (!/\bgit\s+push\b/i.test(command)) return false;
  return (
    hasShortOrLongFlag(command, "f", "--force") ||
    flagTokens(command).some((t) => t === "--force-with-lease")
  );
}

function resetIsHard(command: string): boolean {
  return /\bgit\s+reset\b/i.test(command) && /--hard\b/i.test(command);
}

function cleanIsForce(command: string): boolean {
  return /\bgit\s+clean\b/i.test(command) && hasShortOrLongFlag(command, "f", "--force");
}

function branchIsForceDelete(command: string): boolean {
  return /\bgit\s+branch\b/i.test(command) && /(-D\b|--delete\s+--force\b)/.test(command);
}

function checkoutIsDiscarding(command: string): boolean {
  const match = /\bgit\s+checkout\b(.*)$/i.exec(command);
  if (!match) return false;
  const args = match[1]!.trim().split(/\s+/).filter(Boolean);
  if (args.length === 0) return false;
  return args[0] === "--" || args.every((a) => a === "." || a === "--");
}

function rmIsRecursiveForce(command: string): boolean {
  if (!/\brm\b/i.test(command)) return false;
  return hasShortOrLongFlag(command, "r", "--recursive") && hasShortOrLongFlag(command, "f", "--force");
}

const RISKY_RULES: { reason: string; test: (command: string) => boolean }[] = [
  { reason: "git push --force", test: pushIsForce },
  { reason: "git reset --hard", test: resetIsHard },
  { reason: "git clean -f", test: cleanIsForce },
  { reason: "git branch -D", test: branchIsForceDelete },
  { reason: "git checkout discarding changes", test: checkoutIsDiscarding },
  { reason: "git restore discarding changes", test: (cmd) => /\bgit\s+restore\b/i.test(cmd) },
  { reason: "rm -rf", test: rmIsRecursiveForce },
];

/** Human-readable reason this shell command is considered risky, or `null`
 * if it doesn't match any known destructive/hard-to-reverse pattern. */
export function riskyCommandReason(command: string): string | null {
  for (const { reason, test } of RISKY_RULES) {
    if (test(command)) return reason;
  }
  return null;
}
