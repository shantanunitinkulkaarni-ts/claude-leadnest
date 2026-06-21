// ─────────────────────────────────────────────────────────────────────────────
// TASK GENERATOR  (foundation only — no message content, no AI prompts)
// ─────────────────────────────────────────────────────────────────────────────
// Schedules timed tasks for a lead based on their nurture plan.
// All scheduling is relative to a reference time (typically now).

import { supabaseAdmin } from '@/lib/supabase'

export type TaskConfig = {
  leadId: string
  taskType: string
  scheduledFor: Date
  payload?: Record<string, any>
}

// ─── Schedule helpers ────────────────────────────────────────────────────────

async function scheduleTask(cfg: TaskConfig): Promise<void> {
  const { error } = await supabaseAdmin.from('lead_tasks').insert({
    lead_id: cfg.leadId,
    task_type: cfg.taskType,
    scheduled_for: cfg.scheduledFor.toISOString(),
    status: 'pending',
    payload: cfg.payload ?? {},
  })
  if (error) {
    console.error(`[taskGenerator] Failed to schedule ${cfg.taskType} for lead ${cfg.leadId}:`, error.message)
  }
}

async function cancelTasks(leadId: string, taskTypes?: string[]): Promise<void> {
  let query = supabaseAdmin
    .from('lead_tasks')
    .update({ status: 'cancelled' })
    .eq('lead_id', leadId)
    .in('status', ['pending', 'running'])

  if (taskTypes && taskTypes.length > 0) {
    query = query.in('task_type', taskTypes)
  }

  const { error } = await query
  if (error) {
    console.error(`[taskGenerator] Failed to cancel tasks for lead ${leadId}:`, error.message)
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Schedule the 24-hour nurture sequence:
 *  3h  → nurture_24h_step1
 *  6h  → nurture_24h_step2
 *  12h → nurture_24h_step3
 *  23h → nurture_24h_step4
 */
export async function schedule24HourSequence(
  leadId: string,
  referenceTime: Date = new Date()
): Promise<void> {
  const offsets = [3, 6, 12, 23] // hours
  for (let i = 0; i < offsets.length; i++) {
    const t = new Date(referenceTime.getTime() + offsets[i] * 60 * 60 * 1000)
    await scheduleTask({
      leadId,
      taskType: `nurture_24h_step${i + 1}`,
      scheduledFor: t,
      payload: { step: i + 1, total: offsets.length },
    })
  }
}

/**
 * Schedule Plan B sequence:
 *  1 day  → nurture_b_step1
 *  3 days → nurture_b_step2
 *  7 days → nurture_b_step3
 */
export async function schedulePlanB(
  leadId: string,
  referenceTime: Date = new Date()
): Promise<void> {
  const offsets = [1, 3, 7] // days
  for (let i = 0; i < offsets.length; i++) {
    const t = new Date(referenceTime.getTime() + offsets[i] * 24 * 60 * 60 * 1000)
    await scheduleTask({
      leadId,
      taskType: `nurture_b_step${i + 1}`,
      scheduledFor: t,
      payload: { step: i + 1, total: offsets.length },
    })
  }
}

/**
 * Schedule Plan C sequence:
 *  5 days  → nurture_c_step1
 *  10 days → nurture_c_step2
 *  15 days → nurture_c_step3
 */
export async function schedulePlanC(
  leadId: string,
  referenceTime: Date = new Date()
): Promise<void> {
  const offsets = [5, 10, 15] // days
  for (let i = 0; i < offsets.length; i++) {
    const t = new Date(referenceTime.getTime() + offsets[i] * 24 * 60 * 60 * 1000)
    await scheduleTask({
      leadId,
      taskType: `nurture_c_step${i + 1}`,
      scheduledFor: t,
      payload: { step: i + 1, total: offsets.length },
    })
  }
}

/**
 * Schedule Plan D sequence:
 *  10 days  → nurture_d_step1
 *  14 days  → nurture_d_step2
 *  18 days  → nurture_d_step3
 *  22 days  → nurture_d_step4
 */
export async function schedulePlanD(
  leadId: string,
  referenceTime: Date = new Date()
): Promise<void> {
  const offsets = [10, 14, 18, 22] // days
  for (let i = 0; i < offsets.length; i++) {
    const t = new Date(referenceTime.getTime() + offsets[i] * 24 * 60 * 60 * 1000)
    await scheduleTask({
      leadId,
      taskType: `nurture_d_step${i + 1}`,
      scheduledFor: t,
      payload: { step: i + 1, total: offsets.length },
    })
  }
}

/**
 * Cancel all pending/running nurture tasks for a lead.
 * Optionally filter by specific task types.
 */
export async function cancelPendingTasks(
  leadId: string,
  taskTypes?: string[]
): Promise<void> {
  await cancelTasks(leadId, taskTypes)
}