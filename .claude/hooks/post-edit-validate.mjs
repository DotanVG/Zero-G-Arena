import {
  getTargetedChecks,
  readHookInput,
  runChecks,
  summarizeFailures,
  toProjectRelative
} from './lib/repo-validation.mjs';

const input = await readHookInput();
const relativePath = toProjectRelative(input.tool_input?.file_path || '');
const checks = getTargetedChecks(relativePath);

if (checks.length === 0) {
  process.exit(0);
}

const results = await runChecks(checks);
const failure = summarizeFailures(results);

if (!failure) {
  process.exit(0);
}

process.stdout.write(
  `${JSON.stringify({
    systemMessage: [
      `Background validation failed after editing ${relativePath}.`,
      `Triggered checks: ${checks.join(', ')}`,
      '',
      failure
    ].join('\n')
  })}\n`
);
process.exit(0);
