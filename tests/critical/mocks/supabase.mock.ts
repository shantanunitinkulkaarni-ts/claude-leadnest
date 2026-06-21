/**
 * Mock Supabase client for testing without real database
 */

export class MockSupabaseClient {
  private store: Map<string, Map<string, any>> = new Map()

  from(table: string) {
    if (!this.store.has(table)) {
      this.store.set(table, new Map())
    }

    const tableStore = this.store.get(table)!

    return {
      insert: (data: any) => {
        const id = data.id || `${table}-${Date.now()}`
        tableStore.set(id, { ...data, id })
        return {
          select: () => ({
            single: async () => ({
              data: { ...data, id },
              error: null,
            }),
          }),
          async: async () => ({
            data: [{ ...data, id }],
            error: null,
          }),
        }
      },

      select: (fields?: string) => ({
        eq: (field: string, value: any) => ({
          single: async () => {
            const record = Array.from(tableStore.values()).find(
              (r) => r[field] === value
            )
            return {
              data: record || null,
              error: record ? null : { message: 'not found' },
            }
          },
          async: async () => {
            const records = Array.from(tableStore.values()).filter(
              (r) => r[field] === value
            )
            return {
              data: records,
              error: null,
            }
          },
        }),

        ilike: (field: string, pattern: string) => ({
          async: async () => {
            const regex = new RegExp(
              pattern.replace(/%/g, '.*'),
              'i'
            )
            const records = Array.from(tableStore.values()).filter(
              (r) => regex.test(r[field])
            )
            return {
              data: records,
              error: null,
            }
          },
        }),
      }),

      update: (data: any) => ({
        eq: (field: string, value: any) => ({
          async: async () => {
            const record = Array.from(tableStore.values()).find(
              (r) => r[field] === value
            )
            if (record) {
              Object.assign(record, data)
              return { data: record, error: null }
            }
            return { data: null, error: { message: 'not found' } }
          },
        }),
      }),

      delete: () => ({
        eq: (field: string, value: any) => ({
          async: async () => {
            const keys = Array.from(tableStore.entries())
              .filter(([_, r]) => r[field] === value)
              .map(([k]) => k)
            keys.forEach((k) => tableStore.delete(k))
            return { error: null }
          },
        }),
      }),
    }
  }

  // Helper to clear all data
  clear() {
    this.store.clear()
  }

  // Helper to get raw table data
  getTable(name: string) {
    return Array.from((this.store.get(name) || new Map()).values())
  }
}

export const createMockSupabase = () => new MockSupabaseClient()
