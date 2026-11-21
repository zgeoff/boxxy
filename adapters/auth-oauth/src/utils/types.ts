import type { Clock } from '@zgeoff/std';

// What the door reads and schedules: the time, and a callback to run once after a delay.
export type AuthClock = Pick<Clock, 'now' | 'schedule'>;
