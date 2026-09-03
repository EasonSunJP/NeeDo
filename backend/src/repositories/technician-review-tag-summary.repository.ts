import type { PrismaClient } from "@prisma/client";
import {
  getTechnicianReviewSpecialTag,
  technicianReviewSpecialTags,
  technicianReviewTagKey,
  type TechnicianReviewSpecialTagCode
} from "../domain/technician-review-tags";

export type TechnicianReviewTagSummaryPayload = {
  special: Array<{
    code: TechnicianReviewSpecialTagCode;
    label: string;
    count: number;
  }>;
  custom: Array<{ label: string; count: number }>;
};

type CustomTagAggregate = {
  count: number;
  firstSeenAt: Date;
  label: string;
};

const compareUtf8Bytes = (left: string, right: string): number =>
  Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));

export async function loadTechnicianReviewTagSummary(
  client: Pick<PrismaClient, "orderReviewTag">,
  technicianProfileId: number
): Promise<TechnicianReviewTagSummaryPayload> {
  const rows = await client.orderReviewTag.groupBy({
    by: ["label"],
    where: {
      deletedAt: null,
      orderReview: {
        targetType: "TECHNICIAN",
        technicianProfileId,
        deletedAt: null
      }
    },
    _count: { _all: true },
    _min: { createdAt: true }
  });

  const fixedCounts = new Map<TechnicianReviewSpecialTagCode, number>();
  const customByKey = new Map<string, CustomTagAggregate>();

  for (const row of rows) {
    const count = row._count._all;
    const specialTag = getTechnicianReviewSpecialTag(row.label);
    if (specialTag) {
      fixedCounts.set(specialTag.code, (fixedCounts.get(specialTag.code) ?? 0) + count);
      continue;
    }

    const key = technicianReviewTagKey(row.label);
    const firstSeenAt = row._min.createdAt ?? new Date(0);
    const current = customByKey.get(key);
    if (!current) {
      customByKey.set(key, { count, firstSeenAt, label: row.label });
      continue;
    }

    const shouldReplaceLabel = firstSeenAt < current.firstSeenAt ||
      (firstSeenAt.getTime() === current.firstSeenAt.getTime() && compareUtf8Bytes(row.label, current.label) < 0);
    customByKey.set(key, {
      count: current.count + count,
      firstSeenAt: shouldReplaceLabel ? firstSeenAt : current.firstSeenAt,
      label: shouldReplaceLabel ? row.label : current.label
    });
  }

  return {
    special: technicianReviewSpecialTags.map((tag) => ({
      code: tag.code,
      label: tag.label,
      count: fixedCounts.get(tag.code) ?? 0
    })),
    custom: Array.from(customByKey.values())
      .sort((left, right) =>
        right.count - left.count ||
        left.firstSeenAt.getTime() - right.firstSeenAt.getTime() ||
        compareUtf8Bytes(left.label, right.label)
      )
      .slice(0, 20)
      .map(({ label, count }) => ({ label, count }))
  };
}
