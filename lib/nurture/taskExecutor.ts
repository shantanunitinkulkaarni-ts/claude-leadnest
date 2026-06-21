// ─────────────────────────────────────────────────────────────────────────────
// TASK EXECUTOR  (foundation only — no message content, no AI prompts)
// ─────────────────────────────────────────────────────────────────────────────
// Fetches due tasks from lead_tasks, executes them, and marks completion.
// Called by an external scheduler (cron, webhook, or Vercel cron job).

import { supabaseAdmin } from '@/lib/supabase'

export type LeadTask = {
  id: string
  lead_id: string
  task_type: string
  scheduled_for: string
  executed_at: string | null
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  payload: Record<string, any>
  created_at: string
}

const BATCH_SIZE = 20

// ─── Fetch ───────────────────────────────────────────────────────────────────

/**
 * Fetch tasks that are due for execution.
 * Status = pending, scheduled_for <= now.
 */
export async function fetchDueTasks(): Promise<LeadTask[]> {
  const { data, error } = await supabaseAdmin
    .from('lead_tasks')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_for', new Date().toISOString())
    .order('scheduled_for', { ascending: true })
    .limit(BATCH_SIZE)

  if (error) {
    console.error('[taskExecutor] fetchDueTasks error:', error.message)
    return []
  }

  return (data || []) as LeadTask[]
}

// ─── Execute ─────────────────────────────────────────────────────────────────

/**
 * Execute a single task.
 * Marks task as 'running' before execution, then 'completed' or 'failed'.
 * Currently a framework — no message content or AI prompts.
 */
export async function executeTask(task: LeadTask): Promise<void> {
  const now = new Date().toISOString()

  // Claim the task (row-level lock via status update)
  const { error: claimError } = await supabaseAdmin
    .from('lead_tasks')
    .update({ status: 'running' })
    .eq('id', task.id)
    .eq('status', 'pending') // only claim if still pending

  if (claimError) {
    console.error(`[taskExecutor] Failed to claim task ${task.id}:`, claimError.message)
    return
  }

  try {
    // --- Task execution logic goes here (future) ---
    // This is where message content, AI prompts, and WhatsApp sends will live.
    // For now, just log and complete.
    console.log(`[taskExecutor] Executing task ${task.id} (${task.task_type}) for lead ${task.lead_id}`)

    // Mark completed
    const { error: completeError } = await supabaseAdmin
      .from('lead_tasks')
      .update({ status: 'completed', executed_at: now })
      .eq('id', task.id)

    if (completeError) {
      console.error(`[taskExecutor] Failed to complete task ${task.id}:`, completeError.message)
    }
  } catch (err: any) {
    // Mark failed
    console.error(`[taskExecutor] Task ${task.id} failed:`, err.message)
    await supabaseAdmin
      .from('lead_tasks')
      .update({ status: 'failed', executed_at: now, payload: { error: err.message } })
      .eq('id', task.id)
  }
}

// ─── Run cycle ───────────────────────────────────────────────────────────────

/**
 * Fetch all due tasks and execute them in sequence.
 * Intended to be called by a cron job or webhook endpoint.
 */
export async function runDueTasks(): Promise<{ executed: number; failed: number }> {
  const tasks = await fetchDueTasks()
  let executed = 0
  let failed = 0

  for (const task of tasks) {
    try {
      await executeTask(task)
      executed++
    } catch {
      failed++
    }
  }

  console.log(`[taskExecutor] Run complete: ${executed} executed, ${failed} failed`)
  return { executed, failed }
}

// ─── Status helpers ──────────────────────────────────────────────────────────

export async function markCompleted(taskId: string): Promise<void> {
  await supabaseAdmin
    .from('lead_tasks')
    .update({ status: 'completed', executed_at: new Date().toISOString() })
    .eq('id', taskId)
}

export async function markFailed(taskId: string, error?: string): Promise<void> {
  const payload = error ? { error } : {}
  await supabaseAdmin
    .from('lead_tasks')
    .update({ status: 'failed', executed_at: new Date().toISOString(), payload })
    .eq('id', taskId)
}