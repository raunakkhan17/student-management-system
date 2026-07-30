import type { Holiday, Prisma } from '@prisma/client';
import { prisma } from '@/config/prisma';
import type { ListQueryOptions, PaginatedData } from '@/types/api';
import { NotFoundError } from '@/utils/api-error';
import { buildPaginationMeta } from '@/utils/pagination';

export async function listHolidays(
  query: ListQueryOptions,
  filters: { academicYearId?: string; from?: Date; to?: Date },
): Promise<PaginatedData<Holiday>> {
  const where: Prisma.HolidayWhereInput = {
    ...(filters.academicYearId ? { academicYearId: filters.academicYearId } : {}),
    ...(filters.from || filters.to
      ? {
          date: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {}),
    ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.holiday.findMany({
      where,
      orderBy: { date: query.sortOrder },
      skip: query.skip,
      take: query.take,
    }),
    prisma.holiday.count({ where }),
  ]);

  return { items, pagination: buildPaginationMeta(totalItems, query) };
}

export async function createHoliday(data: Prisma.HolidayUncheckedCreateInput): Promise<Holiday> {
  return prisma.holiday.create({ data });
}

export async function updateHoliday(
  id: string,
  data: Prisma.HolidayUncheckedUpdateInput,
): Promise<Holiday> {
  const existing = await prisma.holiday.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Holiday');
  return prisma.holiday.update({ where: { id }, data });
}

export async function deleteHoliday(id: string): Promise<void> {
  const existing = await prisma.holiday.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Holiday');
  await prisma.holiday.delete({ where: { id } });
}

/** Holidays inside a range, used to grey out the attendance calendar. */
export async function getHolidayCalendar(from: Date, to: Date): Promise<Holiday[]> {
  return prisma.holiday.findMany({
    where: {
      OR: [
        { date: { gte: from, lte: to } },
        // Multi-day holidays that overlap the window from either side.
        { AND: [{ date: { lte: from } }, { endDate: { gte: from } }] },
      ],
    },
    orderBy: { date: 'asc' },
  });
}
