import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';

function formatJalaliDateWords(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00Z`);
  if (isNaN(d.getTime())) return dateStr;
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}

export interface FarmerDashboardData {
  well: {
    id: string;
    name: string;
    description: string | null;
  } | null;
  waterYear: {
    id: string;
    name: string;
    start: string;
    end: string;
    description: string;
  } | null;
  allocationId: string | null;
  quotaHours: number;
  usedHours: number;
  remainingHours: number;
  recentUsages: Array<{
    id: string;
    date: string;
    hours: number;
    description: string | null;
  }>;
}

export interface RepresentativeFarmerItem {
  id: string; // profile id
  name: string;
  phone: string;
  wellFarmerId: string;
  allocationId: string | null;
  quotaHours: number;
  usedHours: number;
  remainingHours: number;
}

export interface RepresentativeDashboardData {
  well: {
    id: string;
    name: string;
    description: string | null;
  } | null;
  waterYear: {
    id: string;
    name: string;
    start: string;
    end: string;
    description: string;
  } | null;
  farmers: RepresentativeFarmerItem[];
}

@Injectable({ providedIn: 'root' })
export class PortalDataService {
  private readonly supabase = inject(SupabaseService).client;

  /**
   * Fetches dashboard data for a logged-in farmer
   */
  async getFarmerDashboard(farmerId: string): Promise<FarmerDashboardData> {
    const emptyResult: FarmerDashboardData = {
      well: null,
      waterYear: null,
      allocationId: null,
      quotaHours: 0,
      usedHours: 0,
      remainingHours: 0,
      recentUsages: [],
    };

    // 1. Find well associated with farmer
    const { data: wf, error: wfError } = await this.supabase
      .from('well_farmers')
      .select('id, well_id, wells ( id, name, description )')
      .eq('farmer_id', farmerId)
      .limit(1)
      .maybeSingle();

    if (wfError || !wf || !wf.wells) {
      return emptyResult;
    }

    const rawWell = wf.wells as unknown as { id: string; name: string; description: string | null };
    const well = {
      id: rawWell.id,
      name: rawWell.name,
      description: rawWell.description,
    };

    // 2. Find active or latest water year for this well
    const { data: wy, error: wyError } = await this.supabase
      .from('water_years')
      .select('id, description, start_date, end_date')
      .eq('well_id', well.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (wyError || !wy) {
      return { ...emptyResult, well };
    }

    const waterYear = {
      id: wy.id,
      name: wy.description || 'سال آبی جاری',
      start: formatJalaliDateWords(wy.start_date),
      end: formatJalaliDateWords(wy.end_date),
      description: wy.description,
    };

    // 3. Find water allocation for this farmer and water year
    const { data: alloc, error: allocError } = await this.supabase
      .from('water_allocations')
      .select('id, allocated_hours')
      .eq('water_year_id', wy.id)
      .eq('well_farmer_id', wf.id)
      .maybeSingle();

    if (allocError || !alloc) {
      return { ...emptyResult, well, waterYear };
    }

    const quotaHours = Number(alloc.allocated_hours) || 0;

    // 4. Find usages recorded for this allocation
    const { data: usages, error: usagesError } = await this.supabase
      .from('water_usages')
      .select('id, consumed_hours, used_at, description')
      .eq('allocation_id', alloc.id)
      .order('used_at', { ascending: false })
      .limit(10);

    if (usagesError || !usages) {
      return {
        well,
        waterYear,
        allocationId: alloc.id,
        quotaHours,
        usedHours: 0,
        remainingHours: quotaHours,
        recentUsages: [],
      };
    }

    const usedHours = usages.reduce((acc, u) => acc + (Number(u.consumed_hours) || 0), 0);
    const remainingHours = Math.max(0, Math.round((quotaHours - usedHours) * 100) / 100);

    return {
      well,
      waterYear,
      allocationId: alloc.id,
      quotaHours,
      usedHours: Math.round(usedHours * 100) / 100,
      remainingHours,
      recentUsages: usages.map((u) => ({
        id: u.id,
        date: formatJalaliDateWords(u.used_at),
        hours: Number(u.consumed_hours) || 0,
        description: u.description,
      })),
    };
  }

  /**
   * Fetches dashboard data for a logged-in representative
   */
  async getRepresentativeDashboard(repId: string): Promise<RepresentativeDashboardData> {
    const emptyResult: RepresentativeDashboardData = {
      well: null,
      waterYear: null,
      farmers: [],
    };

    // 1. Find well represented by this representative
    const { data: well, error: wellError } = await this.supabase
      .from('wells')
      .select('id, name, description')
      .eq('representative_id', repId)
      .limit(1)
      .maybeSingle();

    if (wellError || !well) {
      return emptyResult;
    }

    // 2. Find active or latest water year
    const { data: wy } = await this.supabase
      .from('water_years')
      .select('id, description, start_date, end_date')
      .eq('well_id', well.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const waterYear = wy
      ? {
          id: wy.id,
          name: wy.description || 'سال آبی جاری',
          start: formatJalaliDateWords(wy.start_date),
          end: formatJalaliDateWords(wy.end_date),
          description: wy.description,
        }
      : null;

    // 3. Find farmers assigned to this well
    const { data: wfList, error: wfError } = await this.supabase
      .from('well_farmers')
      .select('id, farmer_id, profiles ( id, full_name, phone )')
      .eq('well_id', well.id);

    if (wfError || !wfList || wfList.length === 0) {
      return {
        well: { id: well.id, name: well.name, description: well.description },
        waterYear,
        farmers: [],
      };
    }

    // 4. Fetch allocation and usages for each farmer in this water year
    const farmerItems: RepresentativeFarmerItem[] = await Promise.all(
      wfList.map(async (item) => {
        const profile = item.profiles as unknown as { id: string; full_name: string; phone: string } | null;
        const name = profile?.full_name || 'کشاورز';
        const phone = profile?.phone || '';
        const farmerProfileId = profile?.id || item.farmer_id;

        if (!wy) {
          return {
            id: farmerProfileId,
            name,
            phone,
            wellFarmerId: item.id,
            allocationId: null,
            quotaHours: 0,
            usedHours: 0,
            remainingHours: 0,
          };
        }

        const { data: alloc } = await this.supabase
          .from('water_allocations')
          .select('id, allocated_hours')
          .eq('water_year_id', wy.id)
          .eq('well_farmer_id', item.id)
          .maybeSingle();

        const quotaHours = alloc ? (Number(alloc.allocated_hours) || 0) : 0;
        let usedHours = 0;

        if (alloc) {
          const { data: usages } = await this.supabase
            .from('water_usages')
            .select('consumed_hours')
            .eq('allocation_id', alloc.id);

          usedHours = (usages || []).reduce((sum, u) => sum + (Number(u.consumed_hours) || 0), 0);
        }

        const remaining = Math.max(0, Math.round((quotaHours - usedHours) * 100) / 100);

        return {
          id: farmerProfileId,
          name,
          phone,
          wellFarmerId: item.id,
          allocationId: alloc?.id || null,
          quotaHours: Math.round(quotaHours * 100) / 100,
          usedHours: Math.round(usedHours * 100) / 100,
          remainingHours: remaining,
        };
      })
    );

    return {
      well: { id: well.id, name: well.name, description: well.description },
      waterYear,
      farmers: farmerItems,
    };
  }

  /**
   * Sets or updates (upserts) water allocation in hours for a farmer in a water year
   */
  async upsertFarmerAllocation(params: {
    waterYearId: string;
    wellFarmerId: string;
    allocatedHours: number;
  }): Promise<string> {
    const { data, error } = await this.supabase
      .from('water_allocations')
      .upsert(
        {
          water_year_id: params.waterYearId,
          well_farmer_id: params.wellFarmerId,
          allocated_hours: params.allocatedHours,
        },
        { onConflict: 'water_year_id,well_farmer_id' }
      )
      .select('id')
      .single();

    if (error || !data) {
      throw new Error(`خطا در ثبت سهمیه آب کشاورز: ${error?.message || 'خطای نامشخص'}`);
    }

    return data.id;
  }

  /**
   * Records water usage in hours for an allocation
   */
  async recordWaterUsage(params: {
    allocationId: string;
    consumedHours: number;
    description?: string;
    usedAt?: string;
    createdBy: string;
  }): Promise<void> {
    const { error } = await this.supabase.from('water_usages').insert({
      allocation_id: params.allocationId,
      consumed_hours: params.consumedHours,
      description: params.description?.trim() || null,
      used_at: params.usedAt || new Date().toISOString(),
      created_by: params.createdBy,
    });

    if (error) {
      throw new Error(`خطا در ثبت مصرف آب: ${error.message}`);
    }
  }

  /**
   * Adds an existing farmer profile to the well and sets allocation if water year exists
   */
  async addFarmerToWell(params: {
    wellId: string;
    farmerId: string;
    allocatedHours?: number;
    waterYearId?: string;
  }): Promise<void> {
    // 1. Insert into well_farmers
    const { data: wf, error: wfError } = await this.supabase
      .from('well_farmers')
      .insert({
        well_id: params.wellId,
        farmer_id: params.farmerId,
      })
      .select('id')
      .single();

    if (wfError || !wf) {
      throw new Error(`خطا در افزودن کشاورز به چاه: ${wfError?.message || 'خطای نامشخص'}`);
    }

    // 2. If waterYearId and allocatedHours provided, create allocation
    if (params.waterYearId && params.allocatedHours !== undefined && params.allocatedHours !== null && params.allocatedHours >= 0) {
      const { error: allocError } = await this.supabase.from('water_allocations').insert({
        water_year_id: params.waterYearId,
        well_farmer_id: wf.id,
        allocated_hours: params.allocatedHours,
      });

      if (allocError) {
        throw new Error(`کشاورز اضافه شد اما در ثبت سهمیه خطایی رخ داد: ${allocError.message}`);
      }
    }
  }

  /**
   * Fetches available farmers who are not yet assigned to this well
   */
  async getAvailableFarmersForWell(wellId: string): Promise<Array<{ id: string; full_name: string; phone: string }>> {
    // Get farmers already assigned
    const { data: existing } = await this.supabase
      .from('well_farmers')
      .select('farmer_id')
      .eq('well_id', wellId);

    const existingIds = new Set((existing || []).map((e) => e.farmer_id));

    // Get active farmer profiles
    const { data: profiles, error } = await this.supabase
      .from('profiles')
      .select('id, full_name, phone')
      .eq('role', 'farmer')
      .eq('is_active', true)
      .order('full_name', { ascending: true });

    if (error) {
      throw new Error(`خطا در دریافت لیست کشاورزان: ${error.message}`);
    }

    return (profiles || []).filter((p) => !existingIds.has(p.id));
  }
}
