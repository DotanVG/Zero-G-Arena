import {
  buildAllChecks,
  findUnstagedTrackedChanges,
  readHookInput,
  runChecks,
  summarizeFailures
} from './lib/repo-validation.mjs';

const input = await readHookInput();
const command = input.tool_input?.command || '';

if (!/^git\s+(commit|push)\b/.test(command)) {
  process.exit(0);
}

const unstagedTracked = await findUnstagedTrackedChanges();
if (unstagedTracked.length > 0) {
  deny(
    `Blocked ${command.split(/\s+/).slice(0, 2).join(' ')} because tracked files still have unstaged changes:\n- ${unstagedTracked.join('\n- ')}`
  );
}

const results = await runChecks(buildAllChecks());
const failure = summarizeFailures(results);

if (failure) {
  deny(
    `Blocked ${command.split(/\s+/).slice(0, 2).join(' ')} because project preflight failed.\nRun /preflight or fix the failing check first.\n\n${failure}`
  );
}

process.exit(0);

function deny(reason) {
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason
      }
    })}\n`
  );
  process.exit(0);
}
