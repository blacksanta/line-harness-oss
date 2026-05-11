import type { HttpClient } from '../http.js'
import type {
  ApiResponse,
  LpPage,
  LpView,
  CreateLpPageInput,
  UpdateLpPageInput,
} from '../types.js'

export class LpPagesResource {
  constructor(private readonly http: HttpClient) {}

  async list(): Promise<LpPage[]> {
    const res = await this.http.get<ApiResponse<LpPage[]>>('/api/lp-pages')
    return res.data
  }

  async get(id: string): Promise<LpPage> {
    const res = await this.http.get<ApiResponse<LpPage>>(`/api/lp-pages/${id}`)
    return res.data
  }

  async create(input: CreateLpPageInput): Promise<LpPage> {
    const res = await this.http.post<ApiResponse<LpPage>>('/api/lp-pages', input)
    return res.data
  }

  async update(id: string, input: UpdateLpPageInput): Promise<LpPage> {
    const res = await this.http.put<ApiResponse<LpPage>>(`/api/lp-pages/${id}`, input)
    return res.data
  }

  async delete(id: string): Promise<void> {
    await this.http.delete(`/api/lp-pages/${id}`)
  }

  async getViews(id: string): Promise<LpView[]> {
    const res = await this.http.get<ApiResponse<LpView[]>>(`/api/lp-pages/${id}/views`)
    return res.data
  }
}
