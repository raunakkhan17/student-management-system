'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Save, ShieldCheck, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ErrorState } from '@/components/common/error-state';
import { FormDialog } from '@/components/common/form-dialog';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/use-auth';
import { ApiError } from '@/lib/api-client';
import { academicService } from '@/services/academic.service';
import { timetableService } from '@/services/timetable.service';
import {
  SLOT_TYPE_LABELS,
  type DayOfWeek,
  type SlotPayload,
  type SlotType,
  type TimetablePeriod,
} from '@/types/timetable';
import {
  buildSlotMap,
  slotKey,
  slotsToPayload,
  TimetableGrid,
  type SlotDisplay,
} from './timetable-grid';

const NONE = '__none__';
const SLOT_TYPES: SlotType[] = ['LECTURE', 'LAB', 'TUTORIAL', 'ASSEMBLY', 'SPORTS', 'LIBRARY'];
const EDITOR_FORM_ID = 'slot-editor-form';

interface EditingCell {
  day: DayOfWeek;
  period: TimetablePeriod;
  existing: SlotPayload | undefined;
}

export function TimetableEditor({ timetableId }: { timetableId: string }) {
  const { can } = useAuth();
  const queryClient = useQueryClient();

  const [slots, setSlots] = useState<SlotPayload[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [conflictIndices, setConflictIndices] = useState<Set<number>>(new Set());
  const [conflictMessages, setConflictMessages] = useState<string[]>([]);

  // Draft values for the cell editor dialog.
  const [draftOfferingId, setDraftOfferingId] = useState(NONE);
  const [draftTeacherId, setDraftTeacherId] = useState(NONE);
  const [draftRoomId, setDraftRoomId] = useState(NONE);
  const [draftType, setDraftType] = useState<SlotType>('LECTURE');
  const [draftNote, setDraftNote] = useState('');

  const timetableQuery = useQuery({
    queryKey: ['timetable', timetableId],
    queryFn: () => timetableService.get(timetableId),
  });

  const periodsQuery = useQuery({
    queryKey: ['timetable', 'periods'],
    queryFn: () => timetableService.listPeriods(),
  });

  const roomsQuery = useQuery({
    queryKey: ['timetable', 'rooms', 'options'],
    queryFn: () => timetableService.listRoomOptions(),
  });

  const timetable = timetableQuery.data;

  const offeringsQuery = useQuery({
    queryKey: ['academics', 'offerings', { classId: timetable?.classId }],
    queryFn: () => academicService.listOfferings({ classId: timetable?.classId ?? '', limit: 100 }),
    enabled: Boolean(timetable?.classId),
  });

  // Load the saved grid whenever a new one arrives from the server, then let
  // local edits own the state. Done during render rather than in an effect so
  // the grid never paints empty for a frame first.
  const [loadedFrom, setLoadedFrom] = useState(timetable);
  if (timetable && timetable !== loadedFrom) {
    setLoadedFrom(timetable);
    setSlots(slotsToPayload(timetable.slots));
    setIsDirty(false);
  }

  const offerings = offeringsQuery.data?.items ?? [];
  const rooms = roomsQuery.data ?? [];

  const offeringById = useMemo(
    () => new Map(offerings.map((offering) => [offering.id, offering])),
    [offerings],
  );
  const roomById = useMemo(() => new Map(rooms.map((room) => [room.id, room])), [rooms]);

  /** Teachers available to a slot come from the offering itself. */
  const teacherChoices = useMemo(() => {
    const seen = new Map<string, { id: string; label: string }>();
    for (const offering of offerings) {
      if (offering.teacher) {
        seen.set(offering.teacher.id, {
          id: offering.teacher.id,
          label: `${offering.teacher.user.firstName} ${offering.teacher.user.lastName}`,
        });
      }
    }
    return [...seen.values()];
  }, [offerings]);

  const describe = (slot: SlotPayload): SlotDisplay => {
    const offering = slot.classSubjectId ? offeringById.get(slot.classSubjectId) : undefined;
    const room = slot.roomId ? roomById.get(slot.roomId) : undefined;
    const teacher =
      slot.teacherId === offering?.teacher?.id
        ? offering?.teacher
        : undefined;

    return {
      subjectName: offering?.subject.name ?? null,
      subjectCode: offering?.subject.code ?? null,
      teacherName: teacher
        ? `${teacher.user.firstName} ${teacher.user.lastName}`
        : (teacherChoices.find((choice) => choice.id === slot.teacherId)?.label ?? null),
      roomName: room ? `${room.name} (${room.code})` : null,
    };
  };

  const slotMap = useMemo(() => buildSlotMap(slots), [slots]);

  const openCell = (day: DayOfWeek, period: TimetablePeriod) => {
    const existing = slotMap.get(slotKey(day, period.id));

    setDraftOfferingId(existing?.classSubjectId ?? NONE);
    setDraftTeacherId(existing?.teacherId ?? NONE);
    setDraftRoomId(existing?.roomId ?? NONE);
    setDraftType(existing?.type ?? 'LECTURE');
    setDraftNote(existing?.note ?? '');
    setEditingCell({ day, period, existing });
  };

  const applyCell = () => {
    if (!editingCell) return;

    const next: SlotPayload = {
      dayOfWeek: editingCell.day,
      periodId: editingCell.period.id,
      classSubjectId: draftOfferingId === NONE ? null : draftOfferingId,
      teacherId: draftTeacherId === NONE ? null : draftTeacherId,
      roomId: draftRoomId === NONE ? null : draftRoomId,
      type: draftType,
      ...(draftNote ? { note: draftNote } : {}),
    };

    setSlots((current) => {
      const withoutCell = current.filter(
        (slot) =>
          !(slot.dayOfWeek === editingCell.day && slot.periodId === editingCell.period.id),
      );
      return [...withoutCell, next];
    });

    setIsDirty(true);
    // Stale conflict highlights would be misleading after an edit.
    setConflictIndices(new Set());
    setConflictMessages([]);
    setEditingCell(null);
  };

  const clearCell = () => {
    if (!editingCell) return;

    setSlots((current) =>
      current.filter(
        (slot) => !(slot.dayOfWeek === editingCell.day && slot.periodId === editingCell.period.id),
      ),
    );
    setIsDirty(true);
    setConflictIndices(new Set());
    setConflictMessages([]);
    setEditingCell(null);
  };

  const applyConflicts = (conflicts: { index: number; message: string }[]) => {
    setConflictIndices(new Set(conflicts.map((conflict) => conflict.index)));
    setConflictMessages(conflicts.map((conflict) => conflict.message));
  };

  const checkMutation = useMutation({
    mutationFn: () => timetableService.checkConflicts(timetableId, slots),
    onSuccess: (result) => {
      if (result.hasConflicts) {
        applyConflicts(result.conflicts);
        toast.error(
          `${result.conflicts.length} conflict${result.conflicts.length === 1 ? '' : 's'} found`,
        );
      } else {
        setConflictIndices(new Set());
        setConflictMessages([]);
        toast.success('No scheduling conflicts');
      }
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not check for conflicts');
    },
  });

  const saveMutation = useMutation({
    mutationFn: () => timetableService.saveSlots(timetableId, slots),
    onSuccess: async () => {
      toast.success('Timetable saved');
      setIsDirty(false);
      setConflictIndices(new Set());
      setConflictMessages([]);
      await queryClient.invalidateQueries({ queryKey: ['timetable'] });
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        // The API returns conflicts as field errors keyed `slots.<index>`.
        const conflicts = error.errors
          .map((fieldError) => {
            const match = /^slots\.(\d+)$/.exec(fieldError.field);
            return match?.[1] !== undefined
              ? { index: Number(match[1]), message: fieldError.message }
              : null;
          })
          .filter((value): value is { index: number; message: string } => value !== null);

        if (conflicts.length > 0) {
          applyConflicts(conflicts);
        }
        toast.error(error.message);
        return;
      }
      toast.error('Could not save the timetable');
    },
  });

  if (timetableQuery.isLoading || periodsQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (timetableQuery.error || !timetable) {
    return (
      <ErrorState error={timetableQuery.error} onRetry={() => void timetableQuery.refetch()} />
    );
  }

  const periods = periodsQuery.data ?? [];
  const canEdit = can('TIMETABLE', 'ASSIGN');

  return (
    <div>
      <PageHeader
        title={timetable.name}
        description={`${timetable.class.name} — ${timetable.section.name} · ${timetable.academicYear.name}${
          timetable.semester ? ` · ${timetable.semester.name}` : ''
        }`}
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Timetable', href: '/timetable' },
          { label: timetable.name },
        ]}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/timetable">
                <ArrowLeft className="size-4" aria-hidden />
                All timetables
              </Link>
            </Button>

            {canEdit && (
              <>
                <Button
                  variant="outline"
                  onClick={() => checkMutation.mutate()}
                  disabled={checkMutation.isPending || slots.length === 0}
                >
                  <ShieldCheck className="size-4" aria-hidden />
                  {checkMutation.isPending ? 'Checking…' : 'Check conflicts'}
                </Button>
                <Button
                  onClick={() => saveMutation.mutate()}
                  disabled={!isDirty || saveMutation.isPending}
                >
                  <Save className="size-4" aria-hidden />
                  {saveMutation.isPending ? 'Saving…' : 'Save timetable'}
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <StatusBadge status={timetable.isActive ? 'ACTIVE' : 'DRAFT'} />
        <span className="text-muted-foreground text-sm">
          {slots.length} slot{slots.length === 1 ? '' : 's'} filled
        </span>
        {isDirty && (
          <span className="text-warning text-sm font-medium">Unsaved changes</span>
        )}
      </div>

      {conflictMessages.length > 0 && (
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle className="size-4" aria-hidden />
          <AlertTitle>
            {conflictMessages.length} scheduling conflict
            {conflictMessages.length === 1 ? '' : 's'}
          </AlertTitle>
          <AlertDescription>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {conflictMessages.slice(0, 6).map((message, index) => (
                <li key={`${message}-${index}`}>{message}</li>
              ))}
              {conflictMessages.length > 6 && (
                <li>…and {conflictMessages.length - 6} more</li>
              )}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="pt-6">
          <TimetableGrid
            periods={periods}
            slots={slotMap}
            describe={describe}
            conflictIndices={conflictIndices}
            onCellClick={openCell}
            readOnly={!canEdit}
          />
        </CardContent>
      </Card>

      {/* ------------------------------------------------------ Cell editor */}
      <FormDialog
        open={editingCell !== null}
        onOpenChange={(open) => {
          if (!open) setEditingCell(null);
        }}
        title={
          editingCell
            ? `${editingCell.day.charAt(0)}${editingCell.day.slice(1).toLowerCase()} · ${editingCell.period.name}`
            : ''
        }
        description="Leave the subject blank for a non-teaching slot such as assembly or sports."
        formId={EDITOR_FORM_ID}
        submitLabel="Apply"
      >
        <form
          id={EDITOR_FORM_ID}
          onSubmit={(event) => {
            event.preventDefault();
            applyCell();
          }}
          className="space-y-5"
        >
          <div className="space-y-2">
            <Label htmlFor="slot-offering">Subject</Label>
            <Select
              value={draftOfferingId}
              onValueChange={(value) => {
                setDraftOfferingId(value);
                // Default the teacher to whoever owns the offering.
                const offering = value === NONE ? undefined : offeringById.get(value);
                setDraftTeacherId(offering?.teacher?.id ?? NONE);
                if (offering?.subject.type === 'PRACTICAL') setDraftType('LAB');
              }}
            >
              <SelectTrigger id="slot-offering" className="w-full">
                <SelectValue placeholder="No subject" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No subject</SelectItem>
                {offerings.map((offering) => (
                  <SelectItem key={offering.id} value={offering.id}>
                    {offering.subject.name} ({offering.subject.code})
                    {offering.section ? ` — ${offering.section.name}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="slot-teacher">Teacher</Label>
              <Select value={draftTeacherId} onValueChange={setDraftTeacherId}>
                <SelectTrigger id="slot-teacher" className="w-full">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Unassigned</SelectItem>
                  {teacherChoices.map((choice) => (
                    <SelectItem key={choice.id} value={choice.id}>
                      {choice.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="slot-room">Room / lab</Label>
              <Select value={draftRoomId} onValueChange={setDraftRoomId}>
                <SelectTrigger id="slot-room" className="w-full">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Unassigned</SelectItem>
                  {rooms.map((room) => (
                    <SelectItem key={room.id} value={room.id}>
                      {room.name} ({room.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="slot-type">Slot type</Label>
            <Select value={draftType} onValueChange={(value) => setDraftType(value as SlotType)}>
              <SelectTrigger id="slot-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SLOT_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {SLOT_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="slot-note">Note</Label>
            <Input
              id="slot-note"
              value={draftNote}
              onChange={(event) => setDraftNote(event.target.value)}
              placeholder="Optional"
              maxLength={200}
            />
          </div>

          {editingCell?.existing && (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={clearCell}
            >
              <Trash2 className="size-4" aria-hidden />
              Clear this slot
            </Button>
          )}
        </form>
      </FormDialog>
    </div>
  );
}
