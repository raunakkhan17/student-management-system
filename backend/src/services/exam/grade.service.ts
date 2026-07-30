import { Prisma, type GradeBand, type GradeScale } from '@prisma/client';
import { prisma } from '@/config/prisma';
import { ConflictError, NotFoundError } from '@/utils/api-error';

export type GradeScaleWithBands = GradeScale & { bands: GradeBand[] };

export interface GradeResult {
  grade: string;
  gradePoint: Prisma.Decimal;
  isPass: boolean;
}

/**
 * Resolves the scale an exam is graded on, falling back to the institution
 * default so an exam is never left ungradeable.
 */
export async function resolveGradeScale(
  gradeScaleId: string | null,
): Promise<GradeScaleWithBands> {
  const scale = gradeScaleId
    ? await prisma.gradeScale.findFirst({
        where: { id: gradeScaleId, deletedAt: null },
        include: { bands: { orderBy: { minPercent: 'desc' } } },
      })
    : await prisma.gradeScale.findFirst({
        where: { isDefault: true, deletedAt: null },
        include: { bands: { orderBy: { minPercent: 'desc' } } },
      });

  if (!scale) {
    throw new NotFoundError('Grade scale — configure one in Settings first');
  }

  if (scale.bands.length === 0) {
    throw new ConflictError(`Grade scale "${scale.name}" has no bands defined`, [
      { field: 'gradeScaleId', message: 'Add grade bands before publishing results' },
    ]);
  }

  return scale;
}

/**
 * Maps a percentage onto a band.
 *
 * Bands are pre-sorted descending, so the first band whose floor the percentage
 * reaches is the match. Falling through means the scale has a gap at the bottom;
 * the lowest band is used rather than throwing mid-publish.
 */
export function gradeFromPercentage(
  percentage: number,
  scale: GradeScaleWithBands,
): GradeResult {
  const band =
    scale.bands.find(
      (candidate) =>
        percentage >= Number(candidate.minPercent) && percentage <= Number(candidate.maxPercent),
    ) ??
    scale.bands.find((candidate) => percentage >= Number(candidate.minPercent)) ??
    scale.bands[scale.bands.length - 1];

  if (!band) {
    throw new ConflictError('The grade scale could not classify this percentage');
  }

  return { grade: band.grade, gradePoint: band.gradePoint, isPass: band.isPass };
}

// ------------------------------------------------------------ Scale management

const scaleInclude = { bands: { orderBy: { minPercent: 'desc' } } } satisfies Prisma.GradeScaleInclude;

export async function listGradeScales(): Promise<GradeScaleWithBands[]> {
  return prisma.gradeScale.findMany({
    where: { deletedAt: null },
    include: scaleInclude,
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  });
}

export async function getGradeScale(id: string): Promise<GradeScaleWithBands> {
  const scale = await prisma.gradeScale.findFirst({
    where: { id, deletedAt: null },
    include: scaleInclude,
  });

  if (!scale) throw new NotFoundError('Grade scale');
  return scale;
}

export interface GradeBandInput {
  grade: string;
  minPercent: number;
  maxPercent: number;
  gradePoint: number;
  description?: string;
  isPass: boolean;
}

/** Bands must cover 0–100 without overlapping, or grading becomes ambiguous. */
function assertBandsAreCoherent(bands: GradeBandInput[]): void {
  if (bands.length === 0) {
    throw new ConflictError('A grade scale needs at least one band', [
      { field: 'bands', message: 'Add at least one band' },
    ]);
  }

  for (const band of bands) {
    if (band.maxPercent < band.minPercent) {
      throw new ConflictError(`Band ${band.grade} has an inverted range`, [
        { field: 'bands', message: `${band.grade}: maximum is below the minimum` },
      ]);
    }
  }

  const sorted = [...bands].sort((a, b) => a.minPercent - b.minPercent);

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (!previous || !current) continue;

    if (current.minPercent <= previous.maxPercent) {
      throw new ConflictError(
        `Bands ${previous.grade} and ${current.grade} overlap`,
        [{ field: 'bands', message: `${previous.grade} and ${current.grade} overlap` }],
      );
    }
  }
}

export async function createGradeScale(input: {
  name: string;
  description?: string;
  isDefault: boolean;
  bands: GradeBandInput[];
}): Promise<GradeScaleWithBands> {
  assertBandsAreCoherent(input.bands);

  return prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.gradeScale.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    }

    const scale = await tx.gradeScale.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        isDefault: input.isDefault,
        bands: {
          create: input.bands.map((band) => ({
            grade: band.grade,
            minPercent: band.minPercent,
            maxPercent: band.maxPercent,
            gradePoint: band.gradePoint,
            description: band.description ?? null,
            isPass: band.isPass,
          })),
        },
      },
      include: scaleInclude,
    });

    return scale;
  });
}

export async function updateGradeScale(
  id: string,
  input: {
    name?: string;
    description?: string;
    isDefault?: boolean;
    bands?: GradeBandInput[];
  },
): Promise<GradeScaleWithBands> {
  await getGradeScale(id);

  if (input.bands) assertBandsAreCoherent(input.bands);

  return prisma.$transaction(async (tx) => {
    if (input.isDefault === true) {
      await tx.gradeScale.updateMany({
        where: { isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    await tx.gradeScale.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
      },
    });

    // Bands are replaced wholesale so the coherence check applies to the result.
    if (input.bands) {
      await tx.gradeBand.deleteMany({ where: { gradeScaleId: id } });
      await tx.gradeBand.createMany({
        data: input.bands.map((band) => ({
          gradeScaleId: id,
          grade: band.grade,
          minPercent: band.minPercent,
          maxPercent: band.maxPercent,
          gradePoint: band.gradePoint,
          description: band.description ?? null,
          isPass: band.isPass,
        })),
      });
    }

    return tx.gradeScale.findUniqueOrThrow({ where: { id }, include: scaleInclude });
  });
}

export async function deleteGradeScale(id: string): Promise<void> {
  const scale = await prisma.gradeScale.findFirst({
    where: { id, deletedAt: null },
    include: { _count: { select: { exams: true } } },
  });

  if (!scale) throw new NotFoundError('Grade scale');

  if (scale.isDefault) {
    throw new ConflictError('The default grade scale cannot be deleted. Make another one default first.');
  }

  if (scale._count.exams > 0) {
    throw new ConflictError('This grade scale is in use by one or more exams.', [
      { field: 'id', message: `Used by ${scale._count.exams} exam(s)` },
    ]);
  }

  await prisma.gradeScale.update({ where: { id }, data: { deletedAt: new Date() } });
}
