import { runAll } from './harness.js';
import './model.test.js';
import './lineSolver.test.js';
import './solver.test.js';
import './contradiction.test.js';
import './mistakes.test.js';

await runAll();
