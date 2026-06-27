export function excludeSampleProperties<T extends Record<string, any>>(rows: T[] | null | undefined): T[] {
  return (rows || []).filter(row => !row?.is_sample)
}
