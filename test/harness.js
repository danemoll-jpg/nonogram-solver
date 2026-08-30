// Tiny zero-dependency test harness (matches the project's no-build-tool convention —
// no Jest/Mocha install needed, just `node test/run.js`).

const suites = [];
let current = null;

export function describe(name, fn) {
  current = { name, tests: [] };
  suites.push(current);
  fn();
  current = null;
}

export function test(name, fn) {
  if (!current) throw new Error('test() called outside describe()');
  current.tests.push({ name, fn });
}

export async function runAll() {
  let pass = 0;
  let fail = 0;
  for (const suite of suites) {
    console.log(`\n${suite.name}`);
    for (const t of suite.tests) {
      try {
        await t.fn();
        console.log(`  ok  - ${t.name}`);
        pass++;
      } catch (err) {
        console.log(`  FAIL - ${t.name}`);
        console.log(`         ${err.message}`);
        fail++;
      }
    }
  }
  console.log(`\n${pass} passed, ${fail} failed\n`);
  if (fail > 0) process.exitCode = 1;
}

export function assert(cond, message) {
  if (!cond) throw new Error(message ?? 'assertion failed');
}

export function assertEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(message ?? `expected ${e} but got ${a}`);
  }
}
