import { Injectable, inject } from '@angular/core';
import { Observable, defer, from } from 'rxjs';
import { SupabaseService } from '@core/supabase.service';
import { UserProfile, UserRole } from '@core/auth.model';

export interface AdminWell {
  id: string;
  name: string;
  description: string | null;
  representative_id: string | null;
  representative_name?: string;
  representative_phone?: string;
  created_at: string;
  farmer_count?: number;
  active_water_year?: string;
}

export interface AdminWaterYear {
  id: string;
  well_id: string;
  description: string;
  start_date: string;
  end_date: string;
  created_at: string;
}

export interface AdminWellFarmer {
  id: string; // well_farmer_id
  well_id: string;
  farmer_id: string;
  farmer_name: string;
  farmer_phone: string;
  created_at: string;
  allocationId?: string | null;
  allocatedHours?: number;
  usedHours?: number;
  remainingHours?: number;
}

export interface DashboardStats {
  totalWells: number;
  totalUsers: number;
  farmersCount: number;
  repsCount: number;
  adminsCount: number;
  activeWaterYears: number;
}

@Injectable({ providedIn: 'root' })
export class AdminDataService {
  private readonly supabase = inject(SupabaseService).client;

  async getDashboardStats(): Promise<DashboardStats> {
    const [usersResult, wellsResult, wyResult] = await Promise.all([
      this.supabase.from('profiles').select('id, role', { count: 'exact' }),
      this.supabase.from('wells').select('id', { count: 'exact' }),
      this.supabase.from('water_years').select('id', { count: 'exact' }),
    ]);

    if (usersResult.error) {
      throw new Error(`خطا در شمارش کاربران: ${usersResult.error.message}`);
    }
    if (wellsResult.error) {
      throw new Error(`خطا در شمارش چاه‌ها: ${wellsResult.error.message}`);
    }

    const profiles = usersResult.data || [];
    return {
      totalWells: wellsResult.count ?? wellsResult.data?.length ?? 0,
      totalUsers: usersResult.count ?? profiles.length,
      farmersCount: profiles.filter((u) => u.role === 'farmer').length,
      repsCount: profiles.filter((u) => u.role === 'representative').length,
      adminsCount: profiles.filter((u) => u.role === 'admin').length,
      activeWaterYears: wyResult.count ?? wyResult.data?.length ?? 0,
    };
  }

  // --- Users Management ---
  async getUsers(params?: { query?: string; role?: string }): Promise<UserProfile[]> {
    let query = this.supabase
      .from('profiles')
      .select('id, full_name, phone, role, is_active, created_at')
      .order('created_at', { ascending: false });

    if (params?.role && params.role !== 'all') {
      query = query.eq('role', params.role);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`خطا در دریافت کاربران: ${error.message}`);
    }

    let result = (data || []) as UserProfile[];
    if (params?.query) {
      const q = params.query.trim().toLowerCase();
      result = result.filter(
        (u) => u.full_name?.toLowerCase().includes(q) || u.phone?.includes(q)
      );
    }
    return result;
  }

  async createUser(user: {
    full_name: string;
    phone: string;
    role: UserRole;
    is_active: boolean;
  }): Promise<UserProfile> {
    const newId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `usr-${Date.now()}`;
    const { data, error } = await this.supabase
      .from('profiles')
      .insert({
        id: newId,
        full_name: user.full_name.trim(),
        phone: user.phone.trim(),
        role: user.role,
        is_active: user.is_active,
      })
      .select()
      .single();

    if (error || !data) {
      throw new Error(`خطا در ایجاد کاربر در سوپابیس: ${error?.message || 'نامشخص'}`);
    }
    return data as UserProfile;
  }

  async updateUser(
    id: string,
    updates: Partial<Omit<UserProfile, 'id'>>
  ): Promise<UserProfile> {
    const { data, error } = await this.supabase
      .from('profiles')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      throw new Error(`خطا در ویرایش کاربر: ${error?.message || 'پروفایل یافت نشد'}`);
    }
    return data as UserProfile;
  }

  async toggleUserStatus(id: string, isActive: boolean): Promise<void> {
    await this.updateUser(id, { is_active: isActive });
  }

  getDashboardStats$(): Observable<DashboardStats> {
    return defer(() => from(this.getDashboardStats()));
  }

  getUsers$(params?: { query?: string; role?: string }): Observable<UserProfile[]> {
    return defer(() => from(this.getUsers(params)));
  }

  createUser$(user: {
    full_name: string;
    phone: string;
    role: UserRole;
    is_active: boolean;
  }): Observable<UserProfile> {
    return defer(() => from(this.createUser(user)));
  }

  updateUser$(
    id: string,
    updates: Partial<Omit<UserProfile, 'id'>>
  ): Observable<UserProfile> {
    return defer(() => from(this.updateUser(id, updates)));
  }

  toggleUserStatus$(id: string, isActive: boolean): Observable<void> {
    return defer(() => from(this.toggleUserStatus(id, isActive)));
  }

  // --- Wells Management ---
  async getWells(queryStr?: string): Promise<AdminWell[]> {
    interface WellQueryResult {
      id: string;
      name: string;
      description: string | null;
      representative_id: string | null;
      created_at: string;
      representative: { id: string; full_name: string; phone: string } | { id: string; full_name: string; phone: string }[] | null;
      well_farmers?: { id: string }[];
      water_years?: { id: string; description: string; start_date: string; end_date: string }[];
    }

    const { data, error } = await this.supabase
      .from('wells')
      .select(
        `
        id,
        name,
        description,
        representative_id,
        created_at,
        representative:profiles!wells_representative_id_fkey(id, full_name, phone),
        well_farmers(id),
        water_years(id, description, start_date, end_date)
      `
      )
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`خطا در دریافت چاه‌ها: ${error.message}`);
    }

    const rows = (data || []) as unknown as WellQueryResult[];
    let wells: AdminWell[] = rows.map((row) => {
      const rep = Array.isArray(row.representative) ? row.representative[0] : row.representative;
      const waterYears = Array.isArray(row.water_years) ? row.water_years : [];
      const latestWy = waterYears[waterYears.length - 1];
      return {
        id: row.id,
        name: row.name,
        description: row.description,
        representative_id: row.representative_id,
        representative_name: rep?.full_name || undefined,
        representative_phone: rep?.phone || undefined,
        created_at: row.created_at,
        farmer_count: Array.isArray(row.well_farmers) ? row.well_farmers.length : 0,
        active_water_year: latestWy ? latestWy.description : undefined,
      };
    });

    if (queryStr) {
      const q = queryStr.trim().toLowerCase();
      wells = wells.filter(
        (w) =>
          w.name.toLowerCase().includes(q) ||
          w.representative_name?.toLowerCase().includes(q)
      );
    }
    return wells;
  }

  async createWell(well: {
    name: string;
    description?: string | null;
    representative_id?: string | null;
  }): Promise<AdminWell> {
    const { data, error } = await this.supabase
      .from('wells')
      .insert({
        name: well.name.trim(),
        description: well.description?.trim() || null,
        representative_id: well.representative_id || null,
      })
      .select(`
        id,
        name,
        description,
        representative_id,
        created_at
      `)
      .single();

    if (error || !data) {
      throw new Error(`خطا در ایجاد چاه در سوپابیس: ${error?.message || 'نامشخص'}`);
    }

    return {
      id: data.id,
      name: data.name,
      description: data.description,
      representative_id: data.representative_id,
      created_at: data.created_at,
      farmer_count: 0,
    };
  }

  async updateWell(
    id: string,
    updates: {
      name?: string;
      description?: string | null;
      representative_id?: string | null;
    }
  ): Promise<void> {
    const { error } = await this.supabase
      .from('wells')
      .update(updates)
      .eq('id', id);

    if (error) {
      throw new Error(`خطا در ویرایش چاه: ${error.message}`);
    }
  }

  // --- Water Years Management ---
  async getWaterYears(wellId: string): Promise<AdminWaterYear[]> {
    const { data, error } = await this.supabase
      .from('water_years')
      .select('id, well_id, description, start_date, end_date, created_at')
      .eq('well_id', wellId)
      .order('start_date', { ascending: false });

    if (error) {
      throw new Error(`خطا در دریافت سال‌های آبی: ${error.message}`);
    }
    const rows = (data || []) as AdminWaterYear[];
    return rows;
  }

  async createWaterYear(wy: {
    well_id: string;
    description: string;
    start_date: string;
    end_date: string;
  }): Promise<AdminWaterYear> {
    const { data, error } = await this.supabase
      .from('water_years')
      .insert({
        well_id: wy.well_id,
        description: wy.description.trim(),
        start_date: wy.start_date,
        end_date: wy.end_date,
      })
      .select()
      .single();

    if (error || !data) {
      throw new Error(`خطا در ثبت سال آبی: ${error?.message || 'نامشخص'}`);
    }
    return data as AdminWaterYear;
  }

  // --- Well Farmers & Allocation Management ---
  async getWellFarmers(wellId: string, targetWaterYearId?: string): Promise<AdminWellFarmer[]> {
    interface WellFarmerQueryResult {
      id: string;
      well_id: string;
      farmer_id: string;
      created_at: string;
      farmer: { id: string; full_name: string; phone: string } | { id: string; full_name: string; phone: string }[] | null;
    }

    // Determine water year (either passed or latest for this well)
    let wyId = targetWaterYearId;
    if (!wyId) {
      const { data: latestWy } = await this.supabase
        .from('water_years')
        .select('id')
        .eq('well_id', wellId)
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      wyId = latestWy?.id;
    }

    const { data, error } = await this.supabase
      .from('well_farmers')
      .select(
        `
        id,
        well_id,
        farmer_id,
        created_at,
        farmer:profiles!well_farmers_farmer_id_fkey(id, full_name, phone)
      `
      )
      .eq('well_id', wellId);

    if (error) {
      throw new Error(`خطا در دریافت لیست کشاورزان چاه: ${error.message}`);
    }

    const rows = (data || []) as unknown as WellFarmerQueryResult[];
    if (rows.length === 0) return [];

    const allocMap = new Map<string, { id: string; allocated_hours: number }>();
    const usageMap = new Map<string, number>();

    if (wyId) {
      const wfIds = rows.map((r) => r.id);
      const { data: allocRows } = await this.supabase
        .from('water_allocations')
        .select('id, well_farmer_id, allocated_hours')
        .eq('water_year_id', wyId)
        .in('well_farmer_id', wfIds);

      if (allocRows && allocRows.length > 0) {
        const allocIds = allocRows.map((a) => a.id);
        for (const a of allocRows) {
          allocMap.set(a.well_farmer_id, {
            id: a.id,
            allocated_hours: Number(a.allocated_hours) || 0,
          });
        }

        const { data: usageRows } = await this.supabase
          .from('water_usages')
          .select('allocation_id, consumed_hours')
          .in('allocation_id', allocIds);

        if (usageRows) {
          for (const u of usageRows) {
            const cur = usageMap.get(u.allocation_id) || 0;
            usageMap.set(u.allocation_id, cur + (Number(u.consumed_hours) || 0));
          }
        }
      }
    }

    return rows.map((row) => {
      const farmer = Array.isArray(row.farmer) ? row.farmer[0] : row.farmer;
      const alloc = allocMap.get(row.id);
      const allocatedHours = alloc ? alloc.allocated_hours : undefined;
      const usedHours = alloc ? (usageMap.get(alloc.id) || 0) : undefined;
      const remainingHours =
        allocatedHours !== undefined
          ? Math.max(0, Math.round((allocatedHours - (usedHours || 0)) * 100) / 100)
          : undefined;

      return {
        id: row.id,
        well_id: row.well_id,
        farmer_id: row.farmer_id,
        farmer_name: farmer?.full_name || 'نامشخص',
        farmer_phone: farmer?.phone || '',
        created_at: row.created_at,
        allocationId: alloc?.id || null,
        allocatedHours,
        usedHours: usedHours !== undefined ? Math.round(usedHours * 100) / 100 : undefined,
        remainingHours,
      };
    });
  }

  async addFarmerToWell(
    wellId: string,
    farmerId: string,
    options?: { waterYearId?: string; allocatedHours?: number }
  ): Promise<AdminWellFarmer> {
    const { data, error } = await this.supabase
      .from('well_farmers')
      .insert({
        well_id: wellId,
        farmer_id: farmerId,
      })
      .select(
        `
        id,
        well_id,
        farmer_id,
        created_at,
        farmer:profiles!well_farmers_farmer_id_fkey(id, full_name, phone)
      `
      )
      .single();

    if (error || !data) {
      throw new Error(`خطا در افزودن کشاورز به چاه: ${error?.message || 'نامشخص'}`);
    }

    interface WellFarmerSingleResult {
      id: string;
      well_id: string;
      farmer_id: string;
      created_at: string;
      farmer: { id: string; full_name: string; phone: string } | { id: string; full_name: string; phone: string }[] | null;
    }
    const row = data as unknown as WellFarmerSingleResult;
    const farmer = Array.isArray(row.farmer) ? row.farmer[0] : row.farmer;

    let allocationId: string | null = null;
    let allocatedHours: number | undefined = undefined;

    if (
      options?.waterYearId &&
      options.allocatedHours !== undefined &&
      options.allocatedHours !== null &&
      options.allocatedHours >= 0
    ) {
      const { data: allocData, error: allocError } = await this.supabase
        .from('water_allocations')
        .insert({
          water_year_id: options.waterYearId,
          well_farmer_id: row.id,
          allocated_hours: options.allocatedHours,
        })
        .select('id, allocated_hours')
        .single();

      if (!allocError && allocData) {
        allocationId = allocData.id;
        allocatedHours = Number(allocData.allocated_hours) || 0;
      }
    }

    return {
      id: row.id,
      well_id: row.well_id,
      farmer_id: row.farmer_id,
      farmer_name: farmer?.full_name || 'کشاورز',
      farmer_phone: farmer?.phone || '',
      created_at: row.created_at,
      allocationId,
      allocatedHours,
      usedHours: 0,
      remainingHours: allocatedHours,
    };
  }

  async setFarmerQuota(
    wellFarmerId: string,
    waterYearId: string,
    allocatedHours: number
  ): Promise<{ id: string; allocatedHours: number }> {
    const { data, error } = await this.supabase
      .from('water_allocations')
      .upsert(
        {
          water_year_id: waterYearId,
          well_farmer_id: wellFarmerId,
          allocated_hours: allocatedHours,
        },
        { onConflict: 'water_year_id,well_farmer_id' }
      )
      .select('id, allocated_hours')
      .single();

    if (error || !data) {
      throw new Error(`خطا در ثبت سهمیه کشاورز: ${error?.message || 'نامشخص'}`);
    }

    return {
      id: data.id,
      allocatedHours: Number(data.allocated_hours) || 0,
    };
  }

  async removeFarmerFromWell(wellFarmerId: string): Promise<void> {
    const { error } = await this.supabase
      .from('well_farmers')
      .delete()
      .eq('id', wellFarmerId);

    if (error) {
      throw new Error(`خطا در حذف کشاورز از چاه: ${error.message}`);
    }
  }

  getWells$(queryStr?: string): Observable<AdminWell[]> {
    return defer(() => from(this.getWells(queryStr)));
  }

  createWell$(well: {
    name: string;
    description?: string | null;
    representative_id?: string | null;
  }): Observable<AdminWell> {
    return defer(() => from(this.createWell(well)));
  }

  updateWell$(
    id: string,
    updates: Partial<Omit<AdminWell, 'id' | 'created_at' | 'farmer_count' | 'active_water_year'>>
  ): Observable<void> {
    return defer(() => from(this.updateWell(id, updates)));
  }

  getWaterYears$(wellId: string): Observable<AdminWaterYear[]> {
    return defer(() => from(this.getWaterYears(wellId)));
  }

  createWaterYear$(wy: {
    well_id: string;
    description: string;
    start_date: string;
    end_date: string;
  }): Observable<AdminWaterYear> {
    return defer(() => from(this.createWaterYear(wy)));
  }

  getWellFarmers$(wellId: string, targetWaterYearId?: string): Observable<AdminWellFarmer[]> {
    return defer(() => from(this.getWellFarmers(wellId, targetWaterYearId)));
  }

  addFarmerToWell$(
    wellId: string,
    farmerId: string,
    options?: { waterYearId?: string; allocatedHours?: number }
  ): Observable<AdminWellFarmer> {
    return defer(() => from(this.addFarmerToWell(wellId, farmerId, options)));
  }

  setFarmerQuota$(
    wellFarmerId: string,
    waterYearId: string,
    allocatedHours: number
  ): Observable<{ id: string; allocatedHours: number }> {
    return defer(() => from(this.setFarmerQuota(wellFarmerId, waterYearId, allocatedHours)));
  }

  removeFarmerFromWell$(wellFarmerId: string): Observable<void> {
    return defer(() => from(this.removeFarmerFromWell(wellFarmerId)));
  }
}
