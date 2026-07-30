import { Prisma, type Author, type BookCategory, type BookCopyStatus, type Publisher, type Shelf } from '@prisma/client';
import { prisma } from '@/config/prisma';
import type { ListQueryOptions, PaginatedData } from '@/types/api';
import { ConflictError, NotFoundError } from '@/utils/api-error';
import { buildPaginationMeta } from '@/utils/pagination';
import { nextSequentialCode, withUniqueRetry } from '@/utils/sequence';
import type { AddCopiesInput, CreateBookInput } from '@/validators/library.validator';

// ------------------------------------------------------------------ Taxonomy

export async function listCategories(query: ListQueryOptions): Promise<PaginatedData<BookCategory>> {
  const where: Prisma.BookCategoryWhereInput = {
    deletedAt: null,
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { code: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.bookCategory.findMany({
      where,
      orderBy: { name: query.sortOrder },
      skip: query.skip,
      take: query.take,
    }),
    prisma.bookCategory.count({ where }),
  ]);

  return { items, pagination: buildPaginationMeta(totalItems, query) };
}

export async function createCategory(
  data: Prisma.BookCategoryUncheckedCreateInput,
): Promise<BookCategory> {
  return prisma.bookCategory.create({ data });
}

export async function deleteCategory(id: string): Promise<void> {
  const category = await prisma.bookCategory.findFirst({
    where: { id, deletedAt: null },
    include: { _count: { select: { books: true } } },
  });

  if (!category) throw new NotFoundError('Book category');

  if (category._count.books > 0) {
    throw new ConflictError('This category still has books.', [
      { field: 'id', message: `${category._count.books} title(s) assigned` },
    ]);
  }

  await prisma.bookCategory.update({ where: { id }, data: { deletedAt: new Date() } });
}

export async function listAuthors(query: ListQueryOptions): Promise<PaginatedData<Author>> {
  const where: Prisma.AuthorWhereInput = {
    deletedAt: null,
    ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.author.findMany({
      where,
      orderBy: { name: query.sortOrder },
      skip: query.skip,
      take: query.take,
    }),
    prisma.author.count({ where }),
  ]);

  return { items, pagination: buildPaginationMeta(totalItems, query) };
}

export async function createAuthor(data: Prisma.AuthorUncheckedCreateInput): Promise<Author> {
  return prisma.author.create({ data });
}

export async function listPublishers(query: ListQueryOptions): Promise<PaginatedData<Publisher>> {
  const where: Prisma.PublisherWhereInput = {
    deletedAt: null,
    ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.publisher.findMany({
      where,
      orderBy: { name: query.sortOrder },
      skip: query.skip,
      take: query.take,
    }),
    prisma.publisher.count({ where }),
  ]);

  return { items, pagination: buildPaginationMeta(totalItems, query) };
}

export async function createPublisher(
  data: Prisma.PublisherUncheckedCreateInput,
): Promise<Publisher> {
  return prisma.publisher.create({ data });
}

export async function listShelves(query: ListQueryOptions): Promise<PaginatedData<Shelf>> {
  const where: Prisma.ShelfWhereInput = {
    deletedAt: null,
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { code: { contains: query.search, mode: 'insensitive' } },
            { location: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.shelf.findMany({
      where,
      orderBy: { code: query.sortOrder },
      skip: query.skip,
      take: query.take,
    }),
    prisma.shelf.count({ where }),
  ]);

  return { items, pagination: buildPaginationMeta(totalItems, query) };
}

export async function createShelf(data: Prisma.ShelfUncheckedCreateInput): Promise<Shelf> {
  return prisma.shelf.create({ data });
}

export async function deleteShelf(id: string): Promise<void> {
  const shelf = await prisma.shelf.findFirst({
    where: { id, deletedAt: null },
    include: { _count: { select: { copies: true } } },
  });

  if (!shelf) throw new NotFoundError('Shelf');

  if (shelf._count.copies > 0) {
    throw new ConflictError('This shelf still holds copies.', [
      { field: 'id', message: `${shelf._count.copies} copy(ies) shelved here` },
    ]);
  }

  await prisma.shelf.update({ where: { id }, data: { deletedAt: new Date() } });
}

// ---------------------------------------------------------------------- Books

const bookInclude = {
  category: { select: { id: true, name: true, code: true } },
  publisher: { select: { id: true, name: true } },
  authors: { select: { author: { select: { id: true, name: true } } } },
  _count: { select: { copies: true, reservations: true } },
} satisfies Prisma.BookInclude;

export type BookRecord = Prisma.BookGetPayload<{ include: typeof bookInclude }>;

export interface BookFilters {
  categoryId?: string;
  publisherId?: string;
  authorId?: string;
  language?: string;
  onlyAvailable?: boolean;
}

export async function listBooks(
  query: ListQueryOptions,
  filters: BookFilters,
): Promise<PaginatedData<BookRecord>> {
  const where: Prisma.BookWhereInput = {
    deletedAt: null,
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters.publisherId ? { publisherId: filters.publisherId } : {}),
    ...(filters.authorId ? { authors: { some: { authorId: filters.authorId } } } : {}),
    ...(filters.language ? { language: filters.language } : {}),
    ...(filters.onlyAvailable ? { availableCopies: { gt: 0 } } : {}),
    ...(query.search
      ? {
          OR: [
            { title: { contains: query.search, mode: 'insensitive' } },
            { isbn: { contains: query.search, mode: 'insensitive' } },
            { authors: { some: { author: { name: { contains: query.search, mode: 'insensitive' } } } } },
          ],
        }
      : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.book.findMany({
      where,
      include: bookInclude,
      orderBy: { title: query.sortOrder },
      skip: query.skip,
      take: query.take,
    }),
    prisma.book.count({ where }),
  ]);

  return { items, pagination: buildPaginationMeta(totalItems, query) };
}

export async function getBook(id: string) {
  const book = await prisma.book.findFirst({
    where: { id, deletedAt: null },
    include: {
      ...bookInclude,
      copies: {
        where: { deletedAt: null },
        include: { shelf: { select: { id: true, code: true, name: true } } },
        orderBy: { accessionNumber: 'asc' },
      },
      reservations: {
        where: { status: { in: ['PENDING', 'READY'] } },
        include: { user: { select: { firstName: true, lastName: true } } },
        orderBy: { reservedAt: 'asc' },
      },
    },
  });

  if (!book) throw new NotFoundError('Book');
  return book;
}

/** Creates a title, resolving author names to records as needed. */
export async function createBook(input: CreateBookInput) {
  return prisma.$transaction(async (tx) => {
    const authorIds = new Set(input.authorIds);

    // Free-text author names are matched case-insensitively before creating,
    // so the catalogue does not accumulate near-duplicate author rows.
    for (const name of input.authorNames) {
      const existing = await tx.author.findFirst({
        where: { name: { equals: name, mode: 'insensitive' }, deletedAt: null },
        select: { id: true },
      });

      if (existing) {
        authorIds.add(existing.id);
      } else {
        const created = await tx.author.create({ data: { name } });
        authorIds.add(created.id);
      }
    }

    const book = await tx.book.create({
      data: {
        title: input.title,
        isbn: input.isbn,
        categoryId: input.categoryId,
        publisherId: input.publisherId ?? null,
        edition: input.edition ?? null,
        publishYear: input.publishYear ?? null,
        language: input.language,
        pages: input.pages ?? null,
        description: input.description ?? null,
        totalCopies: 0,
        availableCopies: 0,
        authors: {
          create: [...authorIds].map((authorId) => ({ authorId })),
        },
      },
    });

    return tx.book.findUniqueOrThrow({ where: { id: book.id }, include: bookInclude });
  });
}

export async function updateBook(id: string, input: Partial<CreateBookInput>) {
  const existing = await prisma.book.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  if (!existing) throw new NotFoundError('Book');

  return prisma.$transaction(async (tx) => {
    await tx.book.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        ...(input.publisherId !== undefined ? { publisherId: input.publisherId } : {}),
        ...(input.edition !== undefined ? { edition: input.edition } : {}),
        ...(input.publishYear !== undefined ? { publishYear: input.publishYear } : {}),
        ...(input.language !== undefined ? { language: input.language } : {}),
        ...(input.pages !== undefined ? { pages: input.pages } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
      },
    });

    if (input.authorIds) {
      await tx.bookAuthor.deleteMany({ where: { bookId: id } });
      await tx.bookAuthor.createMany({
        data: input.authorIds.map((authorId) => ({ bookId: id, authorId })),
        skipDuplicates: true,
      });
    }

    return tx.book.findUniqueOrThrow({ where: { id }, include: bookInclude });
  });
}

export async function deleteBook(id: string): Promise<void> {
  const book = await prisma.book.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      copies: {
        where: { deletedAt: null, status: { in: ['ISSUED', 'RESERVED'] } },
        select: { id: true },
      },
      _count: { select: { copies: true } },
    },
  });

  if (!book) throw new NotFoundError('Book');

  if (book.copies.length > 0) {
    throw new ConflictError('Copies of this title are currently out on loan.', [
      { field: 'id', message: `${book.copies.length} copy(ies) issued or reserved` },
    ]);
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.bookCopy.updateMany({ where: { bookId: id }, data: { deletedAt: now } }),
    prisma.book.update({ where: { id }, data: { deletedAt: now, availableCopies: 0, totalCopies: 0 } }),
  ]);
}

/** Allocates the next accession number, e.g. `ACC/2026/00042`. */
async function generateAccessionNumber(
  tx: Prisma.TransactionClient,
  year: number,
  offset: number,
): Promise<string> {
  const prefix = 'ACC';
  const latest = await tx.bookCopy.findFirst({
    where: { accessionNumber: { startsWith: `${prefix}/${year}/` } },
    orderBy: { accessionNumber: 'desc' },
    select: { accessionNumber: true },
  });

  // `offset` lets one transaction allocate a contiguous block of numbers.
  let current = latest?.accessionNumber ?? null;
  for (let index = 0; index < offset; index += 1) {
    current = nextSequentialCode({ prefix, year, currentMax: current, padding: 5 });
  }

  return nextSequentialCode({ prefix, year, currentMax: current, padding: 5 });
}

/** Registers physical copies against a title. */
export async function addCopies(bookId: string, input: AddCopiesInput) {
  const book = await prisma.book.findFirst({
    where: { id: bookId, deletedAt: null },
    select: { id: true },
  });

  if (!book) throw new NotFoundError('Book');

  const year = (input.purchaseDate ?? new Date()).getUTCFullYear();

  return withUniqueRetry(
    () =>
      prisma.$transaction(async (tx) => {
        const numbers: string[] =
          input.accessionNumbers.length > 0
            ? input.accessionNumbers
            : await Promise.all(
                Array.from({ length: input.count }, (_, index) =>
                  generateAccessionNumber(tx, year, index),
                ),
              );

        await tx.bookCopy.createMany({
          data: numbers.map((accessionNumber) => ({
            bookId,
            accessionNumber,
            shelfId: input.shelfId ?? null,
            condition: input.condition,
            purchaseDate: input.purchaseDate ?? null,
            price: input.price ?? null,
            status: 'AVAILABLE' as const,
          })),
        });

        // Both counters move together — a new copy is available by definition.
        await tx.book.update({
          where: { id: bookId },
          data: {
            totalCopies: { increment: numbers.length },
            availableCopies: { increment: numbers.length },
          },
        });

        return tx.book.findUniqueOrThrow({
          where: { id: bookId },
          include: { ...bookInclude, copies: { where: { deletedAt: null } } },
        });
      }),
    'accessionNumber',
  );
}

export async function updateCopy(
  copyId: string,
  input: { shelfId?: string | null; status?: BookCopyStatus; condition?: string; price?: number },
) {
  const copy = await prisma.bookCopy.findFirst({
    where: { id: copyId, deletedAt: null },
    select: { id: true, bookId: true, status: true },
  });

  if (!copy) throw new NotFoundError('Book copy');

  // Changing status by hand must keep availableCopies honest.
  const wasAvailable = copy.status === 'AVAILABLE';
  const willBeAvailable = (input.status ?? copy.status) === 'AVAILABLE';

  if (copy.status === 'ISSUED' && input.status && input.status !== 'ISSUED') {
    throw new ConflictError('This copy is on loan. Return it through circulation instead.');
  }

  return prisma.$transaction(async (tx) => {
    await tx.bookCopy.update({
      where: { id: copyId },
      data: {
        ...(input.shelfId !== undefined ? { shelfId: input.shelfId } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.condition !== undefined ? { condition: input.condition as never } : {}),
        ...(input.price !== undefined ? { price: input.price } : {}),
      },
    });

    if (wasAvailable !== willBeAvailable) {
      await tx.book.update({
        where: { id: copy.bookId },
        data: { availableCopies: willBeAvailable ? { increment: 1 } : { decrement: 1 } },
      });
    }

    return tx.bookCopy.findUniqueOrThrow({
      where: { id: copyId },
      include: {
        book: { select: { id: true, title: true, isbn: true } },
        shelf: { select: { id: true, code: true, name: true } },
      },
    });
  });
}

export async function listCopies(
  query: ListQueryOptions,
  filters: { bookId?: string; shelfId?: string; status?: BookCopyStatus[] },
) {
  const where: Prisma.BookCopyWhereInput = {
    deletedAt: null,
    ...(filters.bookId ? { bookId: filters.bookId } : {}),
    ...(filters.shelfId ? { shelfId: filters.shelfId } : {}),
    ...(filters.status?.length ? { status: { in: filters.status } } : {}),
    ...(query.search
      ? {
          OR: [
            { accessionNumber: { contains: query.search, mode: 'insensitive' } },
            { book: { title: { contains: query.search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.bookCopy.findMany({
      where,
      include: {
        book: { select: { id: true, title: true, isbn: true } },
        shelf: { select: { id: true, code: true, name: true } },
      },
      orderBy: { accessionNumber: query.sortOrder },
      skip: query.skip,
      take: query.take,
    }),
    prisma.bookCopy.count({ where }),
  ]);

  return { items, pagination: buildPaginationMeta(totalItems, query) };
}

/** Flat rows for the library report export. */
export async function getLibraryReportRows() {
  const books = await prisma.book.findMany({
    where: { deletedAt: null },
    include: bookInclude,
    orderBy: { title: 'asc' },
  });

  return books.map((book) => ({
    Title: book.title,
    ISBN: book.isbn,
    Authors: book.authors.map((link) => link.author.name).join('; '),
    Category: book.category.name,
    Publisher: book.publisher?.name ?? '',
    Edition: book.edition ?? '',
    'Publish Year': book.publishYear ?? '',
    Language: book.language,
    'Total Copies': book.totalCopies,
    'Available Copies': book.availableCopies,
    'On Loan': book.totalCopies - book.availableCopies,
  }));
}
