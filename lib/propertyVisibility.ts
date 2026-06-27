export function excludeSampleProperties<T extends { is_sample?: boolean | null }>(rows: T[] | null | undefined): T[] {
  return (rows || []).filter(row => !row?.is_sample)
}
