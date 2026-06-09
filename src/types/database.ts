/** JSON payloads for `task_events.payload` and similar. */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]
