export interface ContactCandidate {
  id: number;
  userId: number;
  type: string;
  isTestAccount: boolean;
  isActive: boolean;
}

export function selectContactTargets<T extends ContactCandidate>(candidates: T[], ownerUserId: number, type: string, count: number): T[] {
  const seen = new Set<number>();
  const result = candidates.filter(candidate => {
    if (!candidate.isTestAccount || !candidate.isActive || candidate.type !== type || candidate.userId === ownerUserId || seen.has(candidate.userId)) return false;
    seen.add(candidate.userId);
    return true;
  }).slice(0, count);
  if (result.length < count) throw new Error(`insufficient ${type} test identities`);
  return result;
}

export interface StaffingInterval {
  technicianProfileId: number;
  startsAt: string;
  endsAt: string;
}

export interface StaffingShift extends StaffingInterval { date: string }

export function buildAdminStaffingPlan(staff: number[], startDate: string, endDateExclusive: string, hardBookings: StaffingInterval[]): StaffingShift[] {
  if (new Set(staff).size !== staff.length || staff.length < 50) throw new Error("coverage requires 50 distinct test technicians per shop");
  const start = new Date(`${startDate}T00:00:00+09:00`).getTime();
  const end = new Date(`${endDateExclusive}T00:00:00+09:00`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error("invalid staffing window");
  const hour = 3600000;
  const lastEnd = new Map<number, number>();
  const counts = new Map<number, number>();
  const conflicts = new Map<number, Array<{ start: number; end: number }>>();
  for (const booking of hardBookings) {
    const intervals = conflicts.get(booking.technicianProfileId) ?? [];
    intervals.push({ start: Date.parse(booking.startsAt), end: Date.parse(booking.endsAt) });
    conflicts.set(booking.technicianProfileId, intervals);
  }
  const shifts: StaffingShift[] = [];
  for (let dayStart = start, day = 0; dayStart < end; dayStart += 24 * hour, day++) {
    const date = new Date(dayStart + 9 * hour).toISOString().slice(0, 10);
    const candidates: number[][] = [];
    for (let shift = 0; shift < 3; shift++) {
      const startsAt = dayStart + shift * 8 * hour;
      const endsAt = startsAt + 8 * hour;
      const available = staff.map((id, index) => ({ id, preferred: (Math.floor(index / 10) + day) % 5 === shift }))
        .filter(({ id }) => startsAt - (lastEnd.get(id) ?? -Infinity) >= 16 * hour && !(conflicts.get(id) ?? []).some(interval => interval.start < endsAt && interval.end > startsAt))
        .sort((a, b) => Number(b.preferred) - Number(a.preferred) || (counts.get(a.id) ?? 0) - (counts.get(b.id) ?? 0) || a.id - b.id)
        .map(candidate => candidate.id);
      if (available.length < 10) throw new Error(`coverage shortage on ${date} shift ${shift}`);
      candidates.push(available);
    }
    const assigned = new Map<number, number>();
    const fill = (position: number, seen: Set<number>): boolean => {
      for (const id of candidates[Math.floor(position / 10)]!) {
        if (seen.has(id)) continue;
        seen.add(id);
        const previous = assigned.get(id);
        if (previous === undefined || fill(previous, seen)) {
          assigned.set(id, position);
          return true;
        }
      }
      return false;
    };
    const positions = Array.from({ length: 30 }, (_, index) => index).sort((a, b) => candidates[Math.floor(a / 10)]!.length - candidates[Math.floor(b / 10)]!.length || a - b);
    for (const position of positions) if (!fill(position, new Set())) throw new Error(`coverage shortage on ${date}`);
    for (let shift = 0; shift < 3; shift++) {
      const startsAt = dayStart + shift * 8 * hour;
      const endsAt = startsAt + 8 * hour;
      for (const [id, position] of assigned) {
        if (Math.floor(position / 10) !== shift) continue;
        lastEnd.set(id, endsAt); counts.set(id, (counts.get(id) ?? 0) + 1);
        shifts.push({ date, technicianProfileId: id, startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString() });
      }
    }
  }
  return shifts;
}
