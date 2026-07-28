import fs from 'node:fs';
import { poseForPhase } from '../js/solver.js';

const raw = fs.readFileSync(0, 'utf8');
const request = JSON.parse(raw);
const pose = poseForPhase(request.animation, request.phase, request.progress);
process.stdout.write(JSON.stringify(pose));
