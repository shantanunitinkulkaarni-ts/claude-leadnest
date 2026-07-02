const READ_FIELDS = [
  'id',
  'name',
  'email',
  'agency_name',
  'phone',
  'city',
  'state',
  'areas',
  'property_types',
  'bot_tone',
  'office_open',
  'office_close',
  'languages',
  'bot_active',
  'wa_balance',
  'out_of_office_message',
  'wa_phone_number_id',
  'wa_display_name',
  'messages_used',
  'messages_limit',
  'plan',
  'plan_status',
  'plan_expires_at',
  'subscription_charge_at',
  'razorpay_subscription_id',
  'created_at',
  'outreach_intensity',
  'office_address',
  'weekly_off',
  'holidays',
  'wa_verified',
] as const

const SUPERADMIN_READ_FIELDS = [...READ_FIELDS, 'wa_business_id'] as const

export const USER_EDITABLE_FIELDS = [
  'name',
  'agency_name',
  'phone',
  'city',
  'state',
  'areas',
  'property_types',
  'bot_tone',
  'office_open',
  'office_close',
  'languages',
  'bot_active',
  'out_of_office_message',
  'outreach_intensity',
  'office_address',
  'weekly_off',
  'holidays',
] as const

export const SUPERADMIN_EDITABLE_FIELDS = [
  ...USER_EDITABLE_FIELDS,
  'wa_balance',
  'wa_phone_number_id',
  'wa_display_name',
  'wa_verified',
  'wa_business_id',
] as const

export function pickAgentResponseFields(data: Record<string, any>, isSuperadmin: boolean) {
  const fields = isSuperadmin ? SUPERADMIN_READ_FIELDS : READ_FIELDS
  return Object.fromEntries(fields.filter(f => f in data).map(f => [f, data[f]]))
}

export function isPausingBot(safeBody: Record<string, any>) {
  return Object.prototype.hasOwnProperty.call(safeBody, 'bot_active') && safeBody.bot_active === false
}
