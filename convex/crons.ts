import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();

crons.interval(
  'refresh chamber member memories',
  { hours: 6 },
  internal.ai.memberMemory.refreshDuePairs,
  {},
);

export default crons;
