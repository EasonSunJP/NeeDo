export interface CalendarTimeRange {
  startsAt: string;
  endsAt: string;
}

export interface CalendarParticipantBusyRange extends CalendarTimeRange {
  participantIdentityId: number;
  status: "locked";
}

type CalendarParticipantBusySource = {
  participantIdentityId: number;
  startsAt: Date;
  endsAt: Date;
};

export const rangesOverlap = (
  candidate: CalendarTimeRange,
  existing: CalendarTimeRange,
): boolean => (
  Date.parse(candidate.startsAt) < Date.parse(existing.endsAt) &&
  Date.parse(candidate.endsAt) > Date.parse(existing.startsAt)
);

export const projectParticipantBusyRanges = <TRow extends CalendarParticipantBusySource>(
  rows: TRow[],
): CalendarParticipantBusyRange[] => rows
  .filter((row) => row.endsAt.getTime() > row.startsAt.getTime())
  .map((row) => ({
    participantIdentityId: row.participantIdentityId,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    status: "locked",
  }));
