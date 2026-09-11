import { TestBed } from '@angular/core/testing';
import { AdminDataService } from './admin-data.service';
import { SupabaseService } from '@core/supabase.service';

describe('AdminDataService', () => {
  let service: AdminDataService;

  const mockUsers = [
    { id: 'usr-1', full_name: 'کاربر یک', phone: '09121111111', role: 'farmer', is_active: true },
    { id: 'usr-2', full_name: 'کاربر دو', phone: '09122222222', role: 'representative', is_active: false },
  ];

  const mockWells = [
    { id: 'well-1', name: 'چاه یک', description: 'تست', representative_id: 'usr-2', created_at: '2026-01-01', representative: null, well_farmers: [], water_years: [] },
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        AdminDataService,
        {
          provide: SupabaseService,
          useValue: {
            client: {
              from: (table: string) => {
                if (table === 'profiles') {
                  return {
                    select: () => ({
                      order: () => Promise.resolve({ data: mockUsers, error: null }),
                    }),
                    insert: (payload: Record<string, unknown>) => ({
                      select: () => ({
                        single: () => Promise.resolve({ data: { ...payload, id: 'new-id' }, error: null }),
                      }),
                    }),
                    update: (payload: Record<string, unknown>) => ({
                      eq: () => ({
                        select: () => ({
                          single: () => Promise.resolve({ data: { ...mockUsers[0], ...payload }, error: null }),
                        }),
                      }),
                    }),
                  };
                }
                if (table === 'wells') {
                  return {
                    select: () => ({
                      order: () => Promise.resolve({ data: mockWells, error: null }),
                      eq: () => ({
                        single: () => Promise.resolve({ data: mockWells[0], error: null }),
                      }),
                    }),
                    insert: (payload: Record<string, unknown>) => ({
                      select: () => ({
                        single: () => Promise.resolve({ data: { ...payload, id: 'new-well-id', created_at: '2026-01-01' }, error: null }),
                      }),
                    }),
                    update: () => ({
                      eq: () => Promise.resolve({ error: null }),
                    }),
                  };
                }
                if (table === 'water_years') {
                  return {
                    select: () => ({
                      eq: () => ({
                        order: () =>
                          Promise.resolve({
                            data: [
                              {
                                id: 'wy-1',
                                well_id: 'well-1',
                                description: 'سال آبی جاری',
                                start_date: '2026-10-07',
                                end_date: '2027-09-22',
                                created_at: '2026-09-06',
                              },
                            ],
                            error: null,
                          }),
                      }),
                    }),
                    insert: (payload: Record<string, unknown>) => ({
                      select: () => ({
                        single: () =>
                          Promise.resolve({
                            data: {
                              ...payload,
                              id: 'new-wy-id',
                              created_at: '2026-09-06',
                            },
                            error: null,
                          }),
                      }),
                    }),
                  };
                }
                if (table === 'well_expenses') {
                  return {
                    select: () => ({
                      eq: () => ({
                        order: () =>
                          Promise.resolve({
                            data: [
                              {
                                id: 'exp-1',
                                well_id: 'well-1',
                                title: 'هزینه سرویس پیامکی',
                                cost: 1200,
                                expense_type: 'sms',
                                recipient_name: 'علی رضایی',
                                recipient_phone: '09123456789',
                                message_id: '123456',
                                description: 'پیامک کسر ۱۰ ساعت مصرف آب',
                                created_at: '2026-09-11T08:00:00Z',
                              },
                            ],
                            error: null,
                          }),
                      }),
                    }),
                  };
                }
                return {
                  select: () => Promise.resolve({ data: [], error: null }),
                  insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
                  delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
                };
              },
              functions: {
                invoke: () =>
                  Promise.resolve({
                    data: { success: true, message: 'پیامک با موفقیت ارسال شد', cost: 1200 },
                    error: null,
                  }),
              },
            },
          },
        },
      ],
    });
    service = TestBed.inject(AdminDataService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should retrieve users list from Supabase', async () => {
    const users = await service.getUsers();
    expect(users.length).toBe(2);
    expect(users[0].full_name).toBe('کاربر یک');
  });

  it('should create a new user successfully in Supabase', async () => {
    const newUser = await service.createUser({
      full_name: 'کاربر جدید',
      phone: '09129999999',
      role: 'farmer',
      is_active: true,
    });

    expect(newUser.full_name).toBe('کاربر جدید');
  });

  it('should update user status in Supabase', async () => {
    const updated = await service.updateUser('usr-1', { is_active: false });
    expect(updated.is_active).toBe(false);
  });

  it('should retrieve wells list from Supabase', async () => {
    const wells = await service.getWells();
    expect(wells.length).toBe(1);
    expect(wells[0].name).toBe('چاه یک');
  });

  it('should create a well in Supabase', async () => {
    const newWell = await service.createWell({
      name: 'چاه تست کشاورزی',
      description: 'توضیحات تست',
    });

    expect(newWell.name).toBe('چاه تست کشاورزی');
  });

  it('should create water year in Supabase with ISO dates', async () => {
    const wy = await service.createWaterYear({
      well_id: 'well-1',
      description: 'سال آبی ۱۴۰۵',
      start_date: '2026-10-07',
      end_date: '2027-09-22',
    });

    expect(wy.id).toBe('new-wy-id');
    expect(wy.start_date).toBe('2026-10-07');
    expect(wy.end_date).toBe('2027-09-22');
  });

  it('should retrieve water years from Supabase', async () => {
    const years = await service.getWaterYears('well-1');
    expect(years.length).toBe(1);
    expect(years[0].start_date).toBe('2026-10-07');
    expect(years[0].end_date).toBe('2027-09-22');
  });

  it('should retrieve well expenses including SMS costs from Supabase', async () => {
    const expenses = await service.getWellExpenses('well-1');
    expect(expenses.length).toBe(1);
    expect(expenses[0].title).toBe('هزینه سرویس پیامکی');
    expect(expenses[0].cost).toBe(1200);
    expect(expenses[0].recipient_name).toBe('علی رضایی');
    expect(expenses[0].recipient_phone).toBe('09123456789');
  });

  it('should retrieve a single well by id from Supabase', async () => {
    const well = await service.getWell('well-1');
    expect(well.id).toBe('well-1');
    expect(well.name).toBe('چاه یک');
  });

  it('should update well representative via changeWellRepresentative', async () => {
    await expect(service.changeWellRepresentative('well-1', 'usr-new')).resolves.toBeUndefined();
    await expect(service.changeWellRepresentative('well-1', null)).resolves.toBeUndefined();
  });

  it('should notify representative via notifyRepresentativeAssigned', async () => {
    const res = await service.notifyRepresentativeAssigned({
      wellId: 'well-1',
      wellName: 'چاه یک',
      representativeId: 'usr-2',
      phone: '09123456789',
      fullName: 'نماینده یک',
    });
    expect(res.success).toBe(true);
    expect(res.cost).toBe(1200);
  });

  it('should create water year with hours_per_share', async () => {
    const wy = await service.createWaterYear({
      well_id: 'well-1',
      description: 'سال آبی ۱۴۰۴ - ۱۴۰۵',
      start_date: '2025-09-23',
      end_date: '2026-09-22',
      hours_per_share: 16,
    });
    expect(wy.id).toBe('new-wy-id');
    expect(wy.hours_per_share).toBe(16);
  });

  it('should notify farmer quota assigned via notifyFarmerQuotaAssigned', async () => {
    const res = await service.notifyFarmerQuotaAssigned({
      wellId: 'well-1',
      wellName: 'چاه یک',
      waterYearId: 'wy-1',
      farmerId: 'usr-1',
      farmerPhone: '09121111111',
      farmerName: 'کاربر یک',
      allocatedHours: 140,
      hoursPerShare: 16,
    });
    expect(res.success).toBe(true);
    expect(res.cost).toBe(1200);
  });
});
