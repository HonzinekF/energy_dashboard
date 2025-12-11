import { fetchSolaxRealtime } from '../lib/solaxClient.js';

console.log('BASE', process.env.SOLAX_BASE_URL);
const res = await fetchSolaxRealtime();
console.log('Result', res);
